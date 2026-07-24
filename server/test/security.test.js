/**
 * Tier 6 — Security Regression Tests
 *
 * Tests:
 *   1. Mass Assignment Prevention (unexpected fields stripped)
 *   2. IDOR Protection (cannot update other user's profile)
 *   3. Token Revocation / Expired Token Rejection
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import profileRoutes from '../routes/profile.js';
import { enforceJsonContentType } from '../middleware/contentType.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { blacklistToken } from '../config/redis.js';
import FinancialProfile from '../models/FinancialProfile.js';
import { withServer, jsonRequest as jsonFetch } from '../test-utils/httpTestUtils.js';

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
