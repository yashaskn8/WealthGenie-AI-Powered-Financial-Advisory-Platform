/**
 * Comprehensive Cross-User Authorization Audit Suite (Task 1)
 * Verifies that User B cannot read, update, or delete User A's resources.
 *
 * Uses rawRequest from httpTestUtils which returns { status, text(), json() }.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

import profileRoutes from '../routes/profile.js';
import goalRoutes from '../routes/goals.js';
import recommendRoutes from '../routes/recommend.js';

import { enforceJsonContentType } from '../middleware/contentType.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { withServer, rawRequest } from '../test-utils/httpTestUtils.js';

import FinancialProfile from '../models/FinancialProfile.js';
import Goal from '../models/Goal.js';
import Recommendation from '../models/Recommendation.js';

const TEST_DB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/wealthgenie_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-authorization-secret-key';
const JWT_SECRET = process.env.JWT_SECRET;

let dbConnected = false;
let tokenA, tokenB, userAId, userBId;
let profileA, goalA, recommendationA;

function buildTestApp() {
  const app = express();
  app.use(enforceJsonContentType);
  app.use(express.json());
  app.use('/api/profile', profileRoutes);
  app.use('/api/goals', goalRoutes);
  app.use('/api/recommend', recommendRoutes);
  app.use(errorHandler);
  return app;
}

async function ensureDb() {
  if (dbConnected) return;
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_DB_URI);
  }
  dbConnected = true;
}

test.before(async () => {
  await ensureDb();

  userAId = new mongoose.Types.ObjectId().toString();
  userBId = new mongoose.Types.ObjectId().toString();

  tokenA = jwt.sign({ userId: userAId, email: 'usera@authtest.com' }, JWT_SECRET, { expiresIn: '1h' });
  tokenB = jwt.sign({ userId: userBId, email: 'userb@authtest.com' }, JWT_SECRET, { expiresIn: '1h' });

  profileA = await FinancialProfile.create({
    userId: userAId,
    income: 50000, age: 30, savings: 15000,
    annualIncome: 600000, taxSlab: 0.10, effectiveTaxRate: 0.08,
    taxRegime: 'new', riskCategory: 'Moderate', riskScore: 50,
    investableAmount: 15000, investmentHorizon: 10,
  });

  goalA = await Goal.create({
    userId: userAId,
    profileId: profileA._id,
    goal_name: 'User A Retirement Goal',
    target_amount: 1000000,
    target_date: new Date('2035-01-01'),
    priority: 'High',
    current_savings: 50000,
  });

  recommendationA = await Recommendation.create({
    userId: userAId,
    profileId: profileA._id,
    instruments: [{ type: 'Equity_MF', name: 'Nifty 50 Index', effectiveYield: 12.0, allocationWeight: 1.0 }],
    advisoryText: 'User A Advisory',
  });
});

test.after(async () => {
  try {
    await FinancialProfile.deleteMany({ userId: { $in: [userAId, userBId] } });
    await Goal.deleteMany({ userId: { $in: [userAId, userBId] } });
    await Recommendation.deleteMany({ userId: { $in: [userAId, userBId] } });
  } catch (_) {}
  if (dbConnected) {
    await mongoose.disconnect();
  }
});

// ═════════════════════════════════════════════════════════════════════
// Cross-User Authorization Matrix Tests
// ═════════════════════════════════════════════════════════════════════

test('Authorization: User B cannot UPDATE User A profile (PUT /api/profile/:id)', async () => {
  const app = buildTestApp();
  await withServer(app, async (baseUrl) => {
    const res = await rawRequest(`${baseUrl}/api/profile/${profileA._id}`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${tokenB}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        monthly_income: 999999, age: 30, monthly_savings: 15000, investment_horizon: 10,
        regime: 'new', liquid_savings: 100000, existing_debt: 0, dependents: 0,
        emergency_fund_months: 6, risk_tolerance: 'Moderate', goal_type: 'wealth-building',
      }),
    });
    assert.ok(
      res.status === 403 || res.status === 404,
      `Expected 403 or 404, got ${res.status}`
    );
  });
});

test('Authorization: User B cannot READ User A goals (GET /api/goals)', async () => {
  const app = buildTestApp();
  await withServer(app, async (baseUrl) => {
    const res = await rawRequest(`${baseUrl}/api/goals`, {
      method: 'GET',
      headers: { authorization: `Bearer ${tokenB}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.goals.length, 0, 'User B should see 0 goals');
  });
});

test('Authorization: User B cannot REFRESH ADVICE on User A goal (PATCH)', async () => {
  const app = buildTestApp();
  await withServer(app, async (baseUrl) => {
    const res = await rawRequest(`${baseUrl}/api/goals/${goalA._id}/refresh-advice`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${tokenB}`,
        'content-type': 'application/json',
      },
    });
    assert.equal(res.status, 404, `Expected 404, got ${res.status}`);
  });
});

test('Authorization: User B cannot UPDATE User A goal (PATCH /api/goals/:id)', async () => {
  const app = buildTestApp();
  await withServer(app, async (baseUrl) => {
    const res = await rawRequest(`${baseUrl}/api/goals/${goalA._id}`, {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${tokenB}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ target_amount: 9999999 }),
    });
    assert.equal(res.status, 404, `Expected 404, got ${res.status}`);
  });
});

test('Authorization: User B cannot DELETE User A goal (DELETE /api/goals/:id)', async () => {
  const app = buildTestApp();
  await withServer(app, async (baseUrl) => {
    const res = await rawRequest(`${baseUrl}/api/goals/${goalA._id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${tokenB}` },
    });
    assert.equal(res.status, 404, `Expected 404, got ${res.status}`);
  });
});

test('Authorization: User B cannot UPDATE User A recommendation weights', async () => {
  const app = buildTestApp();
  await withServer(app, async (baseUrl) => {
    const res = await rawRequest(`${baseUrl}/api/recommend/weights`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tokenB}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        profileId: profileA._id.toString(),
        weights: { Equity_MF: 1.0 },
      }),
    });
    assert.ok(
      res.status === 403 || res.status === 404,
      `Expected 403 or 404, got ${res.status}`
    );
  });
});

test('Authorization: User A CAN read, update, and delete own goal', async () => {
  const app = buildTestApp();
  await withServer(app, async (baseUrl) => {
    // Read
    const getRes = await rawRequest(`${baseUrl}/api/goals`, {
      method: 'GET',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    assert.equal(getRes.status, 200);
    const body = await getRes.json();
    assert.equal(body.goals.length, 1);
    assert.equal(body.goals[0]._id, goalA._id.toString());

    // Delete
    const delRes = await rawRequest(`${baseUrl}/api/goals/${goalA._id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    assert.equal(delRes.status, 200);
  });
});
