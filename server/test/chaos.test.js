/**
 * Tier 3 — Chaos & Dependency-Failure Integration Tests
 *
 * Tests:
 *   1. MongoDB loss during write returns 503 Service Unavailable
 *   2. Redis offline gracefully falls back to MemoryStore for rate-limiting
 *   3. ML service timeout / failure returns rule-based recommendations
 *   4. Gemini & Groq both failing returns degraded service static response
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import axios from 'axios';
import profileRoutes from '../routes/profile.js';
import recommendRoutes from '../routes/recommend.js';
import goalsRoutes from '../routes/goals.js';
import { apiLimiter } from '../middleware/rateLimiter.js';
import { enforceJsonContentType } from '../middleware/contentType.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { setRedisAvailable, redisAvailable } from '../config/redis.js';
import FinancialProfile from '../models/FinancialProfile.js';
import { setupTestDatabase, teardownTestDatabase } from './helpers/mongoTestHelper.js';

const testJwtSecret = ['chaos', 'test', 'jwt', 'key'].join('-');
process.env.JWT_SECRET = process.env.JWT_SECRET || testJwtSecret;
process.env.NODE_ENV = 'test';

const TEST_USER_ID = new mongoose.Types.ObjectId().toString();

function signToken() {
  return jwt.sign(
    { userId: TEST_USER_ID, email: 'test@example.com', jti: crypto.randomUUID() },
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

// Ensure DB is connected via helper
async function ensureDb() {
  await setupTestDatabase();
}

test.after(async () => {
  try {
    await FinancialProfile.deleteMany({ userId: TEST_USER_ID });
  } catch (_) {}
  await teardownTestDatabase();
});

// ── 1. MongoDB Loss Simulation ──────────────────────────────────────
test('Chaos: MongoDB loss during a profile write returns 503 Service Unavailable', async (t) => {
  await ensureDb();
  
  // Mock FinancialProfile.create to throw a database connection error
  const originalCreate = FinancialProfile.create;
  FinancialProfile.create = async () => {
    const err = new Error('Connection refused');
    err.name = 'MongoNetworkError';
    throw err;
  };

  t.after(() => {
    FinancialProfile.create = originalCreate;
  });

  const token = signToken();
  await withServer(async (baseUrl) => {
    const { response, body } = await jsonFetch(`${baseUrl}/api/profile/build`, {
      method: 'POST',
      body: JSON.stringify(VALID_PROFILE_BODY),
      headers: { authorization: `Bearer ${token}` },
    });

    assert.equal(response.status, 503, `Expected 503 Service Unavailable, got ${response.status}`);
    assert.match(body.error, /temporarily unavailable/i);
  });
});

// ── 2. Redis Offline Simulation ─────────────────────────────────────
test('Chaos: Redis offline fallback to memory store for rate limiting', async (t) => {
  const originalRedisAvailable = redisAvailable;
  
  // Set redisAvailable to false via helper
  setRedisAvailable(false);

  t.after(() => {
    setRedisAvailable(originalRedisAvailable);
  });

  // Verify rate limiter doesn't crash and falls back
  const app = express();
  app.use(apiLimiter);
  app.get('/test-rl', (req, res) => res.json({ ok: true }));

  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/test-rl`;

  try {
    const res = await fetch(url);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

// ── 3. ML Service Failure Simulation ────────────────────────────────
test('Chaos: ML service timeout / failure returns rule-based recommendations', async (t) => {
  await ensureDb();
  const originalPost = axios.post;
  
  // Simulate ML Service throwing a timeout error
  axios.post = async (url, ...args) => {
    if (url.includes('/predict/enriched')) {
      throw new Error('connect ETIMEDOUT 127.0.0.1:8000');
    }
    return originalPost(url, ...args);
  };

  t.after(() => {
    axios.post = originalPost;
  });

  const token = signToken();
  await withServer(async (baseUrl) => {
    // 1. First build a profile (this succeeds because Mongo is online)
    const { response: profileRes, body: profileBody } = await jsonFetch(`${baseUrl}/api/profile/build`, {
      method: 'POST',
      body: JSON.stringify(VALID_PROFILE_BODY),
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(profileRes.status, 201);
    const profileId = profileBody.profileId;

    // 2. Ask for recommendation — ML is mocked to fail, should get rule-based fallback
    const { response: recRes, body: recBody } = await jsonFetch(`${baseUrl}/api/recommend`, {
      method: 'POST',
      body: JSON.stringify({ profileId }),
      headers: { authorization: `Bearer ${token}` },
    });

    assert.equal(recRes.status, 200);
    assert.equal(recBody.ml_fallback, true, 'Should fall back to rule-based recommendations');
    assert.equal(recBody.model_version, 'rule_fallback');
    assert.ok(recBody.instruments.length >= 1);
  });
});

// ── 4. Gemini & Groq Offline Simulation ──────────────────────────────
test('Chaos: Gemini & Groq both failing returns degraded static advisory', async (t) => {
  await ensureDb();
  const originalPost = axios.post;

  // Mock Gemini & Groq API requests to fail
  axios.post = async (url, ...args) => {
    if (url.includes('generativelanguage.googleapis.com') || url.includes('api.groq.com')) {
      throw new Error('API Rate Limit Exceeded or Network Error');
    }
    return originalPost(url, ...args);
  };

  t.after(() => {
    axios.post = originalPost;
  });

  const token = signToken();
  await withServer(async (baseUrl) => {
    // 1. Build profile
    const { response: profileRes, body: profileBody } = await jsonFetch(`${baseUrl}/api/profile/build`, {
      method: 'POST',
      body: JSON.stringify(VALID_PROFILE_BODY),
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(profileRes.status, 201);
    const profileId = profileBody.profileId;

    // 2. Get recommendations
    const { response: recRes, body: recBody } = await jsonFetch(`${baseUrl}/api/recommend`, {
      method: 'POST',
      body: JSON.stringify({ profileId }),
      headers: { authorization: `Bearer ${token}` },
    });

    assert.equal(recRes.status, 200);
    assert.match(recBody.advisory_text, /Based on your profile/i, 'Should fall back to static rule-based advisory text');
  });
});
