/**
 * proofCriticalAuditFixes.test.js — Verification suite for Audit Severity 1 Fixes:
 *   1. Profile creation rate limit `await` enforcement.
 *   2. Debt penalty unit normalization in `getRiskProfile` and profile build/update routes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

import profileRoutes from '../routes/profile.js';
import recommendRoutes from '../routes/recommend.js';
import instrumentRoutes from '../routes/instruments.js';
import { enforceJsonContentType } from '../middleware/contentType.js';
import { errorHandler } from '../middleware/errorHandler.js';
import FinancialProfile from '../models/FinancialProfile.js';
import { getRiskProfile } from '../services/riskProfiler.js';
import * as redisModule from '../config/redis.js';
import { setupTestDatabase, teardownTestDatabase } from './helpers/mongoTestHelper.js';

const testJwtSecret = ['audit', 'fixes', 'test', 'key'].join('-');
process.env.JWT_SECRET = process.env.JWT_SECRET || testJwtSecret;
process.env.NODE_ENV = 'test';

const TEST_USER_ID = new mongoose.Types.ObjectId().toString();

function signToken(userId = TEST_USER_ID) {
  return jwt.sign(
    { userId, email: 'audit-test@example.com', jti: crypto.randomUUID() },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

function buildApp() {
  const app = express();
  app.use(enforceJsonContentType);
  app.use(express.json());
  app.use('/api/profile', profileRoutes);
  app.use('/api/recommend', recommendRoutes);
  app.use('/api/instruments', instrumentRoutes);
  app.use(errorHandler);
  return app;
}

async function withServer(fn) {
  const server = buildApp().listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  try {
    return await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  return { response, body: text ? JSON.parse(text) : null };
}

async function ensureDb() {
  await setupTestDatabase();
}

test.after(async () => {
  try {
    await FinancialProfile.deleteMany({ userId: TEST_USER_ID });
  } catch (_) {}
  await teardownTestDatabase();
});

// ═══════════════════════════════════════════════════════════════════
// 1. Debt Penalty Unit Normalization Unit Tests
// ═══════════════════════════════════════════════════════════════════

test('WG-006: Debt penalty triggers correctly based on monthly ₹ EMI without magnitude-based misfire', () => {
  const annualIncome = 600000; // 50,000 / month

  // Baseline: zero debt (0% EMI burden)
  const baseline = getRiskProfile(30, annualIncome, 15, 0, 0, 10000, 0);

  // WG-006 audit worked example: monthly_income=50000, existing_debt=0.1 (₹50/month EMI)
  const lowDebtInr = getRiskProfile(30, annualIncome, 15, 0, 0, 10000, 50);
  assert.equal(lowDebtInr.riskScore, baseline.riskScore, '0.1% EMI burden (₹50/mo) should incur ~0 penalty');

  // 50% EMI burden passed as rupee amount (25,000/month) → penalty = 10 points
  const highDebtRupees = getRiskProfile(30, annualIncome, 15, 0, 0, 10000, 25000);
  assert.equal(highDebtRupees.riskScore, baseline.riskScore - 10, '25,000 ₹/mo debt (50%) should subtract exactly 10 points');
});

// ═══════════════════════════════════════════════════════════════════
// 2. Profile Build & Update Debt Integration Test
// ═══════════════════════════════════════════════════════════════════

test('Audit Fix 1.2: POST /api/profile/build correctly penalizes profile with 50% debt burden', async () => {
  await ensureDb();
  const token = signToken();

  const basePayload = {
    monthly_income: 50000,
    age: 30,
    monthly_savings: 10000,
    regime: 'new',
    investment_horizon: 15,
    liquid_savings: 50000,
    dependents: 0,
    emergency_fund_months: 3,
    risk_tolerance: 'Moderate',
    goal_type: 'wealth-building',
  };

  await withServer(async (baseUrl) => {
    // 1. Build profile with 0% debt
    const { response: resZero, body: bodyZero } = await jsonFetch(`${baseUrl}/api/profile/build`, {
      method: 'POST',
      body: JSON.stringify({ ...basePayload, existing_debt: 0 }),
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(resZero.status, 201);
    const profileZero = await FinancialProfile.findById(bodyZero.profileId).lean();

    // 2. Build profile with 50% debt
    const { response: resFifty, body: bodyFifty } = await jsonFetch(`${baseUrl}/api/profile/build`, {
      method: 'POST',
      body: JSON.stringify({ ...basePayload, existing_debt: 50 }),
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(resFifty.status, 201);
    const profileFifty = await FinancialProfile.findById(bodyFifty.profileId).lean();

    // Assert: 50% debt profile has riskScore exactly 10 points lower than 0% debt profile
    assert.equal(
      profileFifty.riskScore,
      profileZero.riskScore - 10,
      `Profile with 50% debt should have riskScore ${profileZero.riskScore - 10}, got ${profileFifty.riskScore}`
    );
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. Profile Creation Rate Limit Await Integration Test
// ═══════════════════════════════════════════════════════════════════

test('Audit Fix 1.1: POST /api/profile/build rate limit is actually awaited and enforced', async () => {
  await ensureDb();
  const originalEnv = process.env.DISABLE_RATE_LIMIT;
  process.env.DISABLE_RATE_LIMIT = 'false';

  // Mock Redis client to simulate counter
  const counts = new Map();
  const mockRedisClient = {
    async incr(key) {
      const val = (counts.get(key) || 0) + 1;
      counts.set(key, val);
      return val;
    },
    async expire(key, sec) {}
  };

  redisModule.setRedisAvailable(true);
  redisModule.setRedisClient(mockRedisClient);

  const rateLimitUserId = new mongoose.Types.ObjectId().toString();
  const token = signToken(rateLimitUserId);

  const payload = {
    monthly_income: 50000,
    age: 30,
    monthly_savings: 10000,
    regime: 'new',
    investment_horizon: 15,
    liquid_savings: 50000,
    existing_debt: 0,
    dependents: 0,
    emergency_fund_months: 3,
    risk_tolerance: 'Moderate',
    goal_type: 'wealth-building',
  };

  try {
    await withServer(async (baseUrl) => {
      // Send 10 successful requests (PROFILE_RATE_LIMIT = 10)
      for (let i = 1; i <= 10; i++) {
        const { response } = await jsonFetch(`${baseUrl}/api/profile/build`, {
          method: 'POST',
          body: JSON.stringify(payload),
          headers: { authorization: `Bearer ${token}` },
        });
        assert.equal(response.status, 201, `Request ${i} should succeed with 201`);
      }

      // 11th request must be blocked by rate limit with 429 Too Many Requests
      const { response: res11, body: body11 } = await jsonFetch(`${baseUrl}/api/profile/build`, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: { authorization: `Bearer ${token}` },
      });

      assert.equal(res11.status, 429, `11th request should be blocked with 429, got ${res11.status}`);
      assert.match(body11.error, /Too many profile submissions/i);
    });
  } finally {
    process.env.DISABLE_RATE_LIMIT = originalEnv;
    redisModule.setRedisAvailable(false);
    redisModule.setRedisClient(null);
  }
});

// ── WG-030 HTTP Wire Integration Tests ─────────────────────────────

test('WG-030 HTTP Wire: POST /api/recommend response enforces CONCENTRATION_CAPS over Express wire', async () => {
  await ensureDb();

  const userId = new mongoose.Types.ObjectId().toString();
  const token = signToken(userId);

  // Seed aggressive FinancialProfile document in MongoDB
  const profile = await FinancialProfile.create({
    userId,
    monthlyIncome: 200000,
    annualIncome: 2400000,
    age: 28,
    savings: 80000,
    riskCategory: 'Aggressive',
    investmentHorizon: 20,
    taxRegime: 'new',
  });

  try {
    await withServer(async (baseUrl) => {
      const { response, body } = await jsonFetch(`${baseUrl}/api/recommend`, {
        method: 'POST',
        body: JSON.stringify({ profileId: profile._id }),
        headers: { authorization: `Bearer ${token}` },
      });

      assert.equal(response.status, 200, `POST /api/recommend should succeed with 200, got ${response.status}`);
      assert.ok(Array.isArray(body.instruments), 'Response body must contain instruments array');

      // Verify CONCENTRATION_CAPS over Express HTTP wire
      const smallcapInst = body.instruments.find(i => i.instrumentId === 'smallcap_mf' || i.type === 'Smallcap_MF');
      const equityInst = body.instruments.find(i => i.instrumentId === 'direct_equity' || i.type === 'Equity_MF');

      if (smallcapInst) {
        assert.ok(smallcapInst.allocation_pct <= 15.0, `HTTP response smallcap_mf allocation (${smallcapInst.allocation_pct}%) must not exceed 15% concentration cap`);
      }
      if (equityInst) {
        assert.ok(equityInst.allocation_pct <= 20.0, `HTTP response direct_equity allocation (${equityInst.allocation_pct}%) must not exceed 20% concentration cap`);
      }

      // Verify sum of allocation_pct over HTTP wire equals 100.0%
      const totalPct = parseFloat(body.instruments.reduce((s, i) => s + (i.allocation_pct || 0), 0).toFixed(1));
      assert.equal(totalPct, 100.0, `HTTP response total allocation_pct (${totalPct}%) must equal 100%`);
    });
  } finally {
    await FinancialProfile.deleteMany({ userId });
  }
});

test('WG-030 HTTP Wire: POST /api/instruments/rank-wti reflects catalog risk ordering through Joi schema validation', async () => {
  const token = signToken();

  const candidates = [
    { id: 'sgb', name: 'Custom Synthetic Sovereign Asset', rate: '7.1%' },
    { id: 'custom_unmapped_asset', name: 'Custom Synthetic Sovereign Asset', rate: '7.1%' },
    { id: 'reit_custom', name: 'Embassy Office Parks REIT', rate: '8.5%' },
    { id: 'pharma_custom', name: 'Pharma Sectoral Fund', rate: '16.0%' },
  ];

  await withServer(async (baseUrl) => {
    const { response, body } = await jsonFetch(`${baseUrl}/api/instruments/rank-wti`, {
      method: 'POST',
      body: JSON.stringify({
        candidates,
        userProfile: { age: 55, annualIncome: 800000, riskCategory: 'Conservative', investment_horizon: 5 },
        options: { regimeApplied: false },
      }),
      headers: { authorization: `Bearer ${token}` },
    });

    assert.equal(response.status, 200, `POST /api/instruments/rank-wti should succeed with 200, got ${response.status}`);
    assert.ok(Array.isArray(body.products), 'Response body must contain products array');

    // Verify Joi-stripped payload over Express wire uses server-side catalog lookup: sgb (catalog risk 2 -> WTI 3) outranks unmapped (default risk 5)
    const sgbItem = body.products.find(i => i.id === 'sgb');
    const unmappedItem = body.products.find(i => i.id === 'custom_unmapped_asset');
    assert.ok(sgbItem._score > unmappedItem._score + 15, 'Express HTTP wire response must reflect server-side catalog risk lookup by item.id');
  });
});
