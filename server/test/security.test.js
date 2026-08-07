/**
 * Tier 6 — Security Regression Tests
 *
 * Tests:
 *   1. Mass Assignment Prevention (unexpected fields stripped)
 *   2. IDOR Protection (cannot update other user's profile)
 *   3. Token Revocation / Expired Token Rejection
 *   5. WG-005: POST /api/instruments/rank-wti requires auth + schema validation
 *   6. WG-018: GET /api/metrics requires auth
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import profileRoutes from '../routes/profile.js';
import instrumentRoutes from '../routes/instruments.js';
import metricsRoutes from '../routes/metricsRoutes.js';
import chatRoutes from '../routes/chatRoutes.js';
import { enforceJsonContentType } from '../middleware/contentType.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { blacklistToken } from '../config/redis.js';
import FinancialProfile from '../models/FinancialProfile.js';
import { withServer, jsonRequest as jsonFetch, rawRequest } from '../test-utils/httpTestUtils.js';

process.env.JWT_SECRET = 'security-test-secret';
process.env.NODE_ENV = 'test';

const TEST_DB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/wealthgenie';
const USER_A_ID = new mongoose.Types.ObjectId().toString();
const USER_B_ID = new mongoose.Types.ObjectId().toString();

function signToken(userId, jti = crypto.randomUUID(), expiresIn = '1h') {
  return jwt.sign(
    { userId, email: `${userId}@test.com`, jti },
    process.env.JWT_SECRET,
    { expiresIn }
  );
}

function buildApp() {
  const app = express();
  app.use(enforceJsonContentType);
  app.use(express.json());
  app.use('/api/profile', profileRoutes);
  app.use(errorHandler);
  return app;
}


const VALID_PROFILE_BODY = {
  monthly_income: 80000,
  age: 30,
  monthly_savings: 20000,
  regime: 'new',
  investment_horizon: 15,
  liquid_savings: 100000,
  existing_debt: 0,
  dependents: 0,
  emergency_fund_months: 6,
  risk_tolerance: 'Moderate',
  goal_type: 'wealth-building',
};

let dbConnected = false;
async function ensureDb() {
  if (dbConnected) return;
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_DB_URI);
  }
  dbConnected = true;
}

test.after(async () => {
  try {
    await FinancialProfile.deleteMany({ userId: { $in: [USER_A_ID, USER_B_ID] } });
  } catch (_) {}
  if (dbConnected) {
    await mongoose.disconnect();
  }
});

// ── 1. Mass Assignment Prevention ────────────────────────────────────
test('Security: mass assignment fields are stripped by schema validation', async () => {
  await ensureDb();
  const token = signToken(USER_A_ID);

  await withServer(buildApp(), async (baseUrl) => {
    // Send a payload with unexpected fields (e.g. role, admin, userDetails)
    const { response, body } = await jsonFetch(`${baseUrl}/api/profile/build`, {
      method: 'POST',
      body: JSON.stringify({
        ...VALID_PROFILE_BODY,
        role: 'admin',
        is_admin: true,
        isAdmin: true,
        someUnusedField: 'malicious-data',
      }),
      headers: { authorization: `Bearer ${token}` },
    });

    assert.equal(response.status, 201);
    const profileId = body.profileId;
    assert.ok(profileId);

    // Read the document directly from database to verify those fields do not exist
    const savedDoc = await FinancialProfile.findById(profileId).lean();
    assert.equal(savedDoc.role, undefined, 'role field should not be saved');
    assert.equal(savedDoc.is_admin, undefined, 'is_admin field should not be saved');
    assert.equal(savedDoc.isAdmin, undefined, 'isAdmin field should not be saved');
    assert.equal(savedDoc.someUnusedField, undefined, 'someUnusedField should not be saved');
  });
});

// ── 2. IDOR Protection ───────────────────────────────────────────────
test('Security: user B cannot modify user A profile via IDOR', async () => {
  await ensureDb();
  
  // Create profile A directly in DB
  const profileA = await FinancialProfile.create({
    userId: USER_A_ID,
    income: 80000,
    age: 30,
    savings: 20000,
    annualIncome: 960000,
    taxSlab: 0.1,
    effectiveTaxRate: 5.2,
    taxRegime: 'new',
    riskCategory: 'Moderate',
    riskScore: 50,
    riskDescription: 'Moderate risk',
    recommendedEquityAllocation: 50,
    investableAmount: 20000,
    investmentHorizon: 15,
  });

  const tokenB = signToken(USER_B_ID);

  await withServer(buildApp(), async (baseUrl) => {
    // Attempt to update Profile A using User B's token
    const { response, body } = await jsonFetch(`${baseUrl}/api/profile/${profileA._id}`, {
      method: 'PUT',
      body: JSON.stringify({
        ...VALID_PROFILE_BODY,
        monthly_income: 120000,
        version: profileA.__v,
      }),
      headers: { authorization: `Bearer ${tokenB}` },
    });

    // Should return 403 Forbidden or 404 Not Found (database-scoped queries)
    assert.ok(response.status === 403 || response.status === 404, `Expected 403 or 404, got ${response.status}`);

    // Verify DB remains unchanged
    const doc = await FinancialProfile.findById(profileA._id).lean();
    assert.equal(doc.income, 80000, 'Profile A income must not be updated by User B');
  });
});

// ── 3. Token Revocation Rejection ────────────────────────────────────
test('Security: blocklisted / revoked token is rejected with 401 Unauthorized', async () => {
  await ensureDb();

  const jti = crypto.randomUUID();
  const token = signToken(USER_A_ID, jti);

  // Blacklist the token using standard blacklisting helper
  await blacklistToken(jti, 3600);

  await withServer(buildApp(), async (baseUrl) => {
    const { response, body } = await jsonFetch(`${baseUrl}/api/profile/build`, {
      method: 'POST',
      body: JSON.stringify(VALID_PROFILE_BODY),
      headers: { authorization: `Bearer ${token}` },
    });

    assert.equal(response.status, 401);
    assert.match(body.error, /revoked/i);
  });
});

// ── 4. Expired Token Rejection ───────────────────────────────────────
test('Security: expired token is rejected with 401 Unauthorized', async () => {
  await ensureDb();

  // Create an already expired token (expiresIn: '0s')
  const expiredToken = signToken(USER_A_ID, crypto.randomUUID(), '0s');

  await withServer(buildApp(), async (baseUrl) => {
    const { response, body } = await jsonFetch(`${baseUrl}/api/profile/build`, {
      method: 'POST',
      body: JSON.stringify(VALID_PROFILE_BODY),
      headers: { authorization: `Bearer ${expiredToken}` },
    });

    assert.equal(response.status, 401);
    assert.match(body.error, /expired/i);
  });
});

// ── 5. WG-005: POST /api/instruments/rank-wti auth + validation ───────
function buildInstrumentApp() {
  const app = express();
  app.use(enforceJsonContentType);
  app.use(express.json());
  app.use('/api/instruments', instrumentRoutes);
  app.use(errorHandler);
  return app;
}

test('WG-005: POST /api/instruments/rank-wti returns 401 without auth', async () => {
  await withServer(buildInstrumentApp(), async (baseUrl) => {
    const { response } = await jsonFetch(`${baseUrl}/api/instruments/rank-wti`, {
      method: 'POST',
      body: JSON.stringify({ candidates: [], userProfile: {}, options: {} }),
    });
    assert.equal(response.status, 401, 'rank-wti must reject unauthenticated requests');
  });
});

test('WG-005: POST /api/instruments/rank-wti returns 400 for invalid payload', async () => {
  const token = signToken(USER_A_ID);
  await withServer(buildInstrumentApp(), async (baseUrl) => {
    // candidates array exceeding max 50 items
    const oversizedCandidates = Array.from({ length: 51 }, (_, i) => ({ name: `item${i}` }));
    const { response, body } = await jsonFetch(`${baseUrl}/api/instruments/rank-wti`, {
      method: 'POST',
      body: JSON.stringify({ candidates: oversizedCandidates, userProfile: {}, options: {} }),
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 400, 'rank-wti must reject oversized candidates array');
    assert.ok(body.details || body.error, 'Should return validation error details');
  });
});

test('WG-005: POST /api/instruments/rank-wti returns 400 for malformed userProfile', async () => {
  const token = signToken(USER_A_ID);
  await withServer(buildInstrumentApp(), async (baseUrl) => {
    // age outside valid range (18-80)
    const { response, body } = await jsonFetch(`${baseUrl}/api/instruments/rank-wti`, {
      method: 'POST',
      body: JSON.stringify({
        candidates: [{ name: 'PPF' }],
        userProfile: { age: 150, riskCategory: 'InvalidTier', investment_horizon: 999 },
        options: {},
      }),
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 400, 'rank-wti must reject out-of-range userProfile fields');
    assert.ok(body.details || body.error, 'Should return validation error details');
  });
});

test('WG-005: POST /api/instruments/rank-wti returns 200 for valid authenticated request', async () => {
  const token = signToken(USER_A_ID);
  await withServer(buildInstrumentApp(), async (baseUrl) => {
    const { response, body } = await jsonFetch(`${baseUrl}/api/instruments/rank-wti`, {
      method: 'POST',
      body: JSON.stringify({
        candidates: [{ name: 'PPF' }, { name: 'ELSS' }],
        userProfile: { age: 30, riskCategory: 'Moderate', investment_horizon: 15 },
        options: { regimeApplied: true, regimeKey: 'new' },
      }),
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(response.status, 200, 'rank-wti must succeed with valid auth + valid payload');
    assert.ok(body.success, 'Response should include success flag');
    assert.ok(Array.isArray(body.products), 'Response should include products array');
    assert.equal(body.total, 2, 'Should return 2 ranked products');
  });
});

// ── 6. WG-018: GET /api/metrics auth + old path dead ────────────────
function buildMetricsApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/metrics', metricsRoutes);
  app.use('/api/chat', chatRoutes);
  app.use(errorHandler);
  return app;
}

test('WG-018: GET /api/metrics returns 401 without auth', async () => {
  await withServer(buildMetricsApp(), async (baseUrl) => {
    const { response } = await jsonFetch(`${baseUrl}/api/metrics`, {
      method: 'GET',
    });
    assert.equal(response.status, 401, 'metrics endpoint must reject unauthenticated requests');
  });
});

test('WG-018: GET /api/metrics returns 200 for authenticated request', async () => {
  const token = signToken(USER_A_ID);
  await withServer(buildMetricsApp(), async (baseUrl) => {
    const { response, body } = await jsonFetch(`${baseUrl}/api/metrics`, {
      method: 'GET',
      headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
    });
    assert.equal(response.status, 200, 'metrics endpoint must succeed with valid auth');
  });
});

test('WG-018: GET /api/chat/metrics (old path) returns 404 after relocation', async () => {
  await withServer(buildMetricsApp(), async (baseUrl) => {
    const response = await rawRequest(`${baseUrl}/api/chat/metrics`, {
      method: 'GET',
    });
    assert.equal(response.status, 404, 'old /api/chat/metrics path must be dead after relocation');
  });
});

