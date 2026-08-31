/**
 * test_risk_integration.test.js — Route-level integration test for risk reconciliation.
 *
 * Sequence:
 *   1. POST /api/profile/build  { risk_tolerance: 'Conservative' } → capture profileId
 *   2. POST /api/recommend      { profileId }                      → baseline recommendations
 *   3. PUT  /api/profile/:id    { risk_tolerance: 'Aggressive' }   → in-place update, same _id
 *   4. POST /api/recommend      { profileId }                      → assert recommendations differ
 *
 * Uses MongoMemoryServer (no live DB). Redis is null in test (no mock needed —
 * getCache/setCache guard on !redisClient and return null/undefined).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { setupTestDatabase, teardownTestDatabase } from './helpers/mongoTestHelper.js';
import profileRoutes from '../routes/profile.js';
import recommendRoutes from '../routes/recommend.js';
import { enforceJsonContentType } from '../middleware/contentType.js';
import { errorHandler } from '../middleware/errorHandler.js';
import FinancialProfile from '../models/FinancialProfile.js';

const testJwtSecret = ['risk', 'integration', 'test', 'key'].join('-');
process.env.JWT_SECRET = process.env.JWT_SECRET || testJwtSecret;
process.env.NODE_ENV = 'test';

const TEST_USER_ID = new mongoose.Types.ObjectId().toString();

function signToken() {
  return jwt.sign(
    { userId: TEST_USER_ID, email: 'risk-test@example.com', jti: crypto.randomUUID() },
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

const BASE_PROFILE = {
  monthly_income: 80000,
  age: 30,
  monthly_savings: 20000,
  regime: 'new',
  investment_horizon: 15,
  liquid_savings: 100000,
  existing_debt: 0,
  dependents: 0,
  emergency_fund_months: 6,
  goal_type: 'wealth-building',
};

/**
 * Main integration test:
 *   Build Conservative profile → get recommendations → update to Aggressive → get new recommendations → assert different.
 */
test('Risk Integration: Conservative→Aggressive profile update produces different recommendations', async () => {
  await ensureDb();
  const token = signToken();

  await withServer(async (baseUrl) => {
    // ── Step 1: Create profile with risk_tolerance: 'Conservative' ──
    const { response: buildRes, body: buildBody } = await jsonFetch(`${baseUrl}/api/profile/build`, {
      method: 'POST',
      body: JSON.stringify({ ...BASE_PROFILE, risk_tolerance: 'Conservative' }),
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(buildRes.status, 201, `Expected 201, got ${buildRes.status}: ${JSON.stringify(buildBody)}`);
    const profileId = buildBody.profileId;
    assert.ok(profileId, 'profileId must be returned from /build');

    // ── Step 2: Get baseline recommendations ────────────────────────
    const { response: rec1Res, body: rec1Body } = await jsonFetch(`${baseUrl}/api/recommend`, {
      method: 'POST',
      body: JSON.stringify({ profileId }),
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': 'risk-baseline-001' },
    });
    assert.equal(rec1Res.status, 200, `Recommend 1 expected 200, got ${rec1Res.status}: ${JSON.stringify(rec1Body)}`);
    assert.ok(rec1Body.instruments?.length > 0, 'Baseline recommendations must be non-empty');

    // Verify Section 7 metadata is present
    assert.ok(rec1Body.final_risk_tier, 'final_risk_tier must be present in response');
    assert.ok(typeof rec1Body.reconciliation_note === 'string', 'reconciliation_note must be a string');

    const baseline = rec1Body.instruments;

    // ── Step 3: Update profile to risk_tolerance: 'Aggressive' via PUT ─
    // Fetch current profile to get version for OCC
    const profile = await FinancialProfile.findOne({ _id: profileId, userId: TEST_USER_ID });
    assert.ok(profile, 'Profile must exist in DB');

    const { response: updateRes, body: updateBody } = await jsonFetch(`${baseUrl}/api/profile/${profileId}`, {
      method: 'PUT',
      body: JSON.stringify({
        ...BASE_PROFILE,
        risk_tolerance: 'Aggressive',
        version: profile.version || 1,
      }),
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(updateRes.status, 200, `PUT expected 200, got ${updateRes.status}: ${JSON.stringify(updateBody)}`);

    // Verify the profile was updated in-place (same _id)
    const updatedProfile = await FinancialProfile.findById(profileId).lean();
    assert.equal(updatedProfile.risk_tolerance, 'Aggressive', 'Profile should now be Aggressive');
    assert.equal(updatedProfile._id.toString(), profileId, 'Same _id after PUT');

    // ── Step 4: Get new recommendations ─────────────────────────────
    const { response: rec2Res, body: rec2Body } = await jsonFetch(`${baseUrl}/api/recommend`, {
      method: 'POST',
      body: JSON.stringify({ profileId }),
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': 'risk-updated-001' },
    });
    assert.equal(rec2Res.status, 200, `Recommend 2 expected 200, got ${rec2Res.status}: ${JSON.stringify(rec2Body)}`);
    assert.ok(rec2Body.instruments?.length > 0, 'Updated recommendations must be non-empty');

    const updated = rec2Body.instruments;

    // ── Assert: recommendations differ ──────────────────────────────
    // Compare by stringifying instrument names + allocation weights
    const serializeRec = (instruments) =>
      instruments.map(i => `${i.instrumentId}:${i.allocationWeight}`).sort().join(',');

    const baselineSerialized = serializeRec(baseline);
    const updatedSerialized = serializeRec(updated);

    assert.notEqual(
      baselineSerialized,
      updatedSerialized,
      'Recommendations must differ after changing risk_tolerance from Conservative to Aggressive.\n' +
      `  Baseline: ${baselineSerialized}\n  Updated:  ${updatedSerialized}`
    );

    // Verify final_risk_tier changed
    assert.notEqual(
      rec1Body.final_risk_tier,
      rec2Body.final_risk_tier,
      `final_risk_tier should differ: ${rec1Body.final_risk_tier} vs ${rec2Body.final_risk_tier}`
    );
  });
});
