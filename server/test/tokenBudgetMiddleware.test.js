/**
 * Token Budget Middleware - Integration Test
 * -------------------------------------------
 * Proves that a user can be throttled by cumulative *token volume*
 * even while staying under the request-count rate limit.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { checkTokenBudget, recordTokenUsage, _testStore } from '../middleware/tokenBudget.js';
import { withServer, rawRequest } from '../test-utils/httpTestUtils.js';

// helpers
function fakeAuth(userId = 'user-1') {
  return (req, _res, next) => {
    req.user = { userId };
    next();
  };
}

function buildApp(budgetOpts = {}) {
  const app = express();
  app.use(express.json());
  app.post(
    '/chat',
    fakeAuth(),
    checkTokenBudget(budgetOpts),
    (req, res) => {
      const tokens = req.body?.tokens ?? 100;
      recordTokenUsage(req, tokens);
      res.json({ ok: true, tokensRecorded: tokens });
    }
  );
  return app;
}

function postChat(base, tokens) {
  const body = JSON.stringify({ tokens });
  return rawRequest(base + '/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
}

// tests

test('token budget: allows requests within the budget', async () => {
  _testStore.resetAll();
  const app = buildApp({ maxTokens: 1000, windowMs: 60000 });

  await withServer(app, async (base) => {
    const r1 = await postChat(base, 400);
    assert.equal(r1.status, 200, 'first request within budget should pass');

    const r2 = await postChat(base, 400);
    assert.equal(r2.status, 200, 'second request still within budget should pass');
  });
});

test('token budget: blocks when cumulative tokens exceed the limit', async () => {
  _testStore.resetAll();
  const app = buildApp({ maxTokens: 500, windowMs: 60000 });

  await withServer(app, async (base) => {
    // Use 300 tokens - under budget
    const r1 = await postChat(base, 300);
    assert.equal(r1.status, 200);

    // Use 250 more - total 550, over 500 budget
    const r2 = await postChat(base, 250);
    assert.equal(r2.status, 200, 'second request passes (budget checked before recording)');

    // Third request should be blocked - cumulative 550 > 500
    const r3 = await postChat(base, 10);
    assert.equal(r3.status, 429, 'third request blocked after budget exceeded');

    const body = await r3.json();
    assert.equal(body.code, 'TOKEN_BUDGET_EXCEEDED');
    assert.equal(body.error, body.message, 'compatibility error alias matches canonical message');
    assert.ok(body.details.retryAfterSeconds > 0, 'structured details include retry-after');
    assert.equal(Number(r3.headers.get('retry-after')), body.details.retryAfterSeconds);
  });
});

test('token budget: different users have independent budgets', async () => {
  _testStore.resetAll();

  const app = express();
  app.use(express.json());

  app.post('/chat/a', fakeAuth('user-A'), checkTokenBudget({ maxTokens: 500 }), (req, res) => {
    recordTokenUsage(req, req.body?.tokens ?? 100);
    res.json({ ok: true });
  });
  app.post('/chat/b', fakeAuth('user-B'), checkTokenBudget({ maxTokens: 500 }), (req, res) => {
    recordTokenUsage(req, req.body?.tokens ?? 100);
    res.json({ ok: true });
  });

  await withServer(app, async (base) => {
    // User A burns 600 tokens (over budget)
    await rawRequest(base + '/chat/a', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tokens: 600 }),
    });

    // User A should be blocked
    const rA = await rawRequest(base + '/chat/a', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tokens: 1 }),
    });
    assert.equal(rA.status, 429, 'user A blocked');

    // User B should still be allowed
    const rB = await rawRequest(base + '/chat/b', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tokens: 100 }),
    });
    assert.equal(rB.status, 200, 'user B unaffected by user A exhausting budget');
  });
});

test('token budget: window resets after expiry', async () => {
  _testStore.resetAll();
  // Very short window: 200ms
  const app = buildApp({ maxTokens: 100, windowMs: 200 });

  await withServer(app, async (base) => {
    // Exhaust budget
    await postChat(base, 150);
    const blocked = await postChat(base, 1);
    assert.equal(blocked.status, 429, 'blocked immediately after exhausting budget');

    // Wait for window to reset
    await new Promise(r => setTimeout(r, 300));

    const afterReset = await postChat(base, 50);
    assert.equal(afterReset.status, 200, 'allowed again after window reset');
  });
});

test('token budget: many small requests stay under budget', async () => {
  _testStore.resetAll();
  const app = buildApp({ maxTokens: 10000, windowMs: 60000 });

  await withServer(app, async (base) => {
    for (let i = 0; i < 20; i++) {
      const r = await postChat(base, 10);
      assert.equal(r.status, 200, 'request ' + (i + 1) + ' should pass (low token usage)');
    }
  });
});
