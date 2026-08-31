/**
 * Tier 2 — Exhaustive Input Validation Integration Tests
 *
 * Tests:
 *   1. Content-Type Header Enforcement (rejects non-JSON Content-Type for POST/PUT/PATCH with 415)
 *   2. Payload Size Limit Enforcement (rejects payloads > 100kb with 413)
 *   3. Boundary Validation (rejects negative numbers, out-of-bounds inputs, empty values, invalid enums with 400)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import profileRoutes from '../routes/profile.js';
import goalsRoutes from '../routes/goals.js';
import { enforceJsonContentType } from '../middleware/contentType.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { registerSchema } from '../validation/schemas.js';

process.env.JWT_SECRET = 'validation-test-secret';
process.env.NODE_ENV = 'test';

const TEST_USER_ID = '65b000000000000000000001';

function signToken() {
  return jwt.sign(
    { userId: TEST_USER_ID, email: 'test@example.com', jti: crypto.randomUUID() },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );
}

test('registration schema accepts the non-deliverable CI identity domain', () => {
  const unique = '1725140000000-1234';
  const { error, value } = registerSchema.validate({
    name: `E2E User ${unique}`,
    email: `e2e-${unique}@example.com`,
    mobile: '9876543210',
    password: 'Valid@Pass2026!',
  });

  assert.equal(error, undefined);
  assert.equal(value.email, `e2e-${unique}@example.com`);
});

function buildApp() {
  const app = express();
  app.use(enforceJsonContentType);
  app.use(express.json({ limit: '100kb' }));
  app.use('/api/profile', profileRoutes);
  app.use('/api/goals', goalsRoutes);
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

async function rawFetch(url, options = {}) {
  return fetch(url, options);
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body && !options.headers?.['content-type'] && !options.headers?.['Content-Type']
        ? { 'content-type': 'application/json' }
        : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  return { response, body: text ? JSON.parse(text) : null };
}

// ── 1. Content-Type Enforcements ─────────────────────────────────────
test('Validation: POST request with missing Content-Type returns 415', async () => {
  const token = signToken();
  await withServer(async (baseUrl) => {
    const response = await rawFetch(`${baseUrl}/api/profile/build`, {
      method: 'POST',
      body: JSON.stringify({}),
      headers: {
        authorization: `Bearer ${token}`,
      }, // Missing Content-Type
    });
    assert.equal(response.status, 415);
    const body = await response.json();
    assert.equal(body.error, 'Unsupported Media Type');
  });
});

test('Validation: POST request with text/plain Content-Type returns 415', async () => {
  const token = signToken();
  await withServer(async (baseUrl) => {
    const response = await rawFetch(`${baseUrl}/api/profile/build`, {
      method: 'POST',
      body: JSON.stringify({}),
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'text/plain',
      },
    });
    assert.equal(response.status, 415);
  });
});

// ── 2. Payload Size Limits ───────────────────────────────────────────
test('Validation: POST request exceeding 100kb payload size limit returns 413', async () => {
  const token = signToken();
  await withServer(async (baseUrl) => {
    // Generate a payload larger than 100kb
    const hugeString = 'A'.repeat(110 * 1024); // 110 KB
    const response = await rawFetch(`${baseUrl}/api/profile/build`, {
      method: 'POST',
      body: JSON.stringify({
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
        huge_field: hugeString,
      }),
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
    });
    
    // Express returns 413 Payload Too Large on json limit violation
    assert.equal(response.status, 413);
  });
});

// ── 3. Parametrized boundary validation ──────────────────────────────
const boundaryCases = [
  {
    name: 'Negative monthly_income',
    payload: { monthly_income: -5000, age: 30, monthly_savings: 2000, liquid_savings: 0, existing_debt: 0, dependents: 0, emergency_fund_months: 0, risk_tolerance: 'Moderate', goal_type: 'wealth-building' },
  },
  {
    name: 'Income exceeding max constraint (10 Crores)',
    payload: { monthly_income: 200000000, age: 30, monthly_savings: 2000, liquid_savings: 0, existing_debt: 0, dependents: 0, emergency_fund_months: 0, risk_tolerance: 'Moderate', goal_type: 'wealth-building' },
  },
  {
    name: 'Age below minimum limit (18)',
    payload: { monthly_income: 50000, age: 16, monthly_savings: 5000, liquid_savings: 0, existing_debt: 0, dependents: 0, emergency_fund_months: 0, risk_tolerance: 'Moderate', goal_type: 'wealth-building' },
  },
  {
    name: 'Age above maximum limit (80)',
    payload: { monthly_income: 50000, age: 95, monthly_savings: 5000, liquid_savings: 0, existing_debt: 0, dependents: 0, emergency_fund_months: 0, risk_tolerance: 'Moderate', goal_type: 'wealth-building' },
  },
  {
    name: 'Monthly savings greater than monthly income',
    payload: { monthly_income: 50000, age: 30, monthly_savings: 60000, liquid_savings: 0, existing_debt: 0, dependents: 0, emergency_fund_months: 0, risk_tolerance: 'Moderate', goal_type: 'wealth-building' },
  },
  {
    name: 'Invalid risk_tolerance enum value',
    payload: { monthly_income: 50000, age: 30, monthly_savings: 10000, liquid_savings: 0, existing_debt: 0, dependents: 0, emergency_fund_months: 0, risk_tolerance: 'SuperAggressive', goal_type: 'wealth-building' },
  },
  {
    name: 'Invalid goal_type enum value',
    payload: { monthly_income: 50000, age: 30, monthly_savings: 10000, liquid_savings: 0, existing_debt: 0, dependents: 0, emergency_fund_months: 0, risk_tolerance: 'Moderate', goal_type: 'crypto-speculation' },
  },
];

for (const tc of boundaryCases) {
  test(`Validation boundary: ${tc.name} should fail with 400 Bad Request`, async () => {
    const token = signToken();
    await withServer(async (baseUrl) => {
      const { response, body } = await jsonFetch(`${baseUrl}/api/profile/build`, {
        method: 'POST',
        body: JSON.stringify(tc.payload),
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      assert.equal(response.status, 400, `Expected 400 Bad Request, got ${response.status} for ${tc.name}`);
      assert.equal(body.error, 'Validation failed');
      assert.ok(body.details && body.details.length > 0);
    });
  });
}
