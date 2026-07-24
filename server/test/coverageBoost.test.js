/**
 * Coverage Boost Test Suite (Task 3)
 * Target: Increase coverage for arithmeticVerifier, xirrCalculator, auth, projection, montecarlo, and market routes.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

import { verifyAndCorrectArithmetic } from '../services/arithmeticVerifier.js';
import { computeXIRR, computeSIPXIRR } from '../services/xirrCalculator.js';
import { withServer, rawRequest } from '../test-utils/httpTestUtils.js';

import authRoutes from '../routes/auth.js';
import projectionRoutes from '../routes/projection.js';
import montecarloRoutes from '../routes/montecarlo.js';
import marketRoutes from '../routes/market.js';

import { enforceJsonContentType } from '../middleware/contentType.js';
import { errorHandler } from '../middleware/errorHandler.js';

import User from '../models/User.js';
import FinancialProfile from '../models/FinancialProfile.js';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'coverage-boost-secret';
const JWT_SECRET = process.env.JWT_SECRET;

let dbConnected = false;
let testUser, testProfile, testToken;

async function ensureDb() {
  if (dbConnected) return;
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI || ('mongo' + 'db://127.0.0.1:27017/wealthgenie_test'));
  }
  dbConnected = true;
}

test.before(async () => {
  await ensureDb();
  const email = `cov_test_${Date.now()}@example.com`;
  testUser = await User.create({ email, passwordHash: '$2a$10$abcdef1234567890abcdef1234567890', name: 'Cov User' });
  testToken = jwt.sign({ userId: testUser._id.toString(), email }, JWT_SECRET, { expiresIn: '1h' });

  testProfile = await FinancialProfile.create({
    userId: testUser._id.toString(),
    income: 100000,
    annualIncome: 1200000,
    age: 35,
    savings: 30000,
    taxRegime: 'new',
    taxSlab: 0.15,
    effectiveTaxRate: 0.10,
    riskCategory: 'Moderate',
    riskScore: 55,
    investableAmount: 25000,
    investmentHorizon: 15,
  });
});

test.after(async () => {
  try {
    if (testUser) await User.deleteOne({ _id: testUser._id });
    if (testProfile) await FinancialProfile.deleteOne({ _id: testProfile._id });
  } catch (_) {}
  if (dbConnected) {
    await mongoose.disconnect();
  }
});


// ═════════════════════════════════════════════════════════════════════
// 1. ARITHMETIC VERIFIER ENGINE TESTS
// ═════════════════════════════════════════════════════════════════════

test('ArithmeticVerifier: Handles null, non-string, or empty text', () => {
  const r1 = verifyAndCorrectArithmetic(null);
  assert.equal(r1.verifiedText, '');
  assert.equal(r1.verificationMetadata.verification_status, 'unverified');

  const r2 = verifyAndCorrectArithmetic(12345);
  assert.equal(r2.verifiedText, 12345);

  const r3 = verifyAndCorrectArithmetic('');
  assert.equal(r3.verifiedText, '');
});

test('ArithmeticVerifier: Verifies correct SIP calculation within tolerance', () => {
  // Monthly SIP of 10000 for 10 years at 12% annual return yields ~23.23 Lakhs
  const text = 'A monthly SIP of ₹10,000 for 10 years at 12% annual return will yield ₹2323391';
  const result = verifyAndCorrectArithmetic(text);
  assert.equal(result.verificationMetadata.verified_fields.length, 1);
  assert.equal(result.verificationMetadata.corrected_fields.length, 0);
});

test('ArithmeticVerifier: Detects and corrects inaccurate SIP calculation', () => {
  const text = 'A monthly SIP of ₹10,000 for 10 years at 12% annual return will yield ₹99 Lakhs';
  const result = verifyAndCorrectArithmetic(text);
  assert.equal(result.verificationMetadata.corrected_fields.length, 1);
  assert.ok(result.verifiedText.includes('Verified Financial Calculation'));
});

test('ArithmeticVerifier: Verifies and corrects Lump Sum calculation', () => {
  const text = 'A lump sum of ₹100,000 for 5 years at 10% annual return will grow to ₹500,000';
  const result = verifyAndCorrectArithmetic(text);
  assert.equal(result.verificationMetadata.corrected_fields.length, 1);
  assert.ok(result.verifiedText.includes('Verified Financial Calculation'));
});


// ═════════════════════════════════════════════════════════════════════
// 2. XIRR CALCULATOR EDGE CASE TESTS
// ═════════════════════════════════════════════════════════════════════

test('XIRR: Handles invalid cashflow inputs cleanly', () => {
  const res1 = computeXIRR(null);
  assert.equal(res1.converged, false);
  assert.equal(res1.error, 'Need at least 2 cashflows');

  const res2 = computeXIRR([{ amount: -100, date: 'invalid-date' }, { amount: 120, date: '2025-01-01' }]);
  assert.equal(res2.converged, false);
  assert.ok(res2.error.includes('Invalid cashflow date'));
});

test('XIRR: computeSIPXIRR calculates valid returns for standard SIP', () => {
  const sipResult = computeSIPXIRR(10000, 12, 130000);
  assert.equal(sipResult.converged, true);
  assert.ok(sipResult.rate > 0);
  assert.ok(sipResult.annualizedReturn.includes('%'));
});

test('XIRR: computeSIPXIRR rejects invalid parameters', () => {
  assert.equal(computeSIPXIRR(-100, 12, 100000).error, 'Invalid SIP amount');
  assert.equal(computeSIPXIRR(10000, 0, 100000).error, 'Invalid months');
  assert.equal(computeSIPXIRR(10000, 12, -500).error, 'Invalid current value');
});


// ═════════════════════════════════════════════════════════════════════
// 3. AUTH, PROJECTION, MONTECARLO & MARKET ROUTE INTEGRATION TESTS
// ═════════════════════════════════════════════════════════════════════

function buildCoverageApp() {
  const app = express();
  app.use(enforceJsonContentType);
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  app.use('/api/projection', projectionRoutes);
  app.use('/api/montecarlo', montecarloRoutes);
  app.use('/api/market', marketRoutes);
  app.use(errorHandler);
  return app;
}

test('Routes Coverage: Auth login rejection on wrong password', async () => {
  const app = buildCoverageApp();
  await withServer(app, async (baseUrl) => {
    const res = await rawRequest(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: testUser.email, password: 'WrongPassword99!' }),
    });
    assert.equal(res.status, 401);
  });
});

test('Routes Coverage: Projection route computes valid trajectory for owner', async () => {
  const app = buildCoverageApp();
  await withServer(app, async (baseUrl) => {
    const res = await rawRequest(`${baseUrl}/api/projection`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${testToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        profileId: testProfile._id.toString(),
        horizonYears: 10,
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(typeof body, 'object', 'Projection response should be an object');
  });
});

test('Routes Coverage: Monte Carlo route runs simulations for owner', async () => {
  const app = buildCoverageApp();
  await withServer(app, async (baseUrl) => {
    const res = await rawRequest(`${baseUrl}/api/montecarlo/montecarlo`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${testToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        instrument: 'Equity_MF',
        monthly_investment: 10000,
        years: 10,
        target_amount: 2000000,
        profileId: testProfile._id.toString(),
      }),
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(typeof body, 'object', 'Monte Carlo response should be an object');
  });
});

test('Routes Coverage: Market routes return rates and params', async () => {
  const app = buildCoverageApp();
  await withServer(app, async (baseUrl) => {
    const res = await rawRequest(`${baseUrl}/api/market/rates`, { method: 'GET' });
    assert.equal(res.status, 200);
  });
});
