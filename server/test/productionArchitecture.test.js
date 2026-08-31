import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { correlationIdMiddleware } from '../middleware/correlation.js';
import { createCsrfProtection } from '../middleware/csrf.js';
import { createOperationalMiddleware } from '../middleware/operations.js';
import { createRuntimeState } from '../services/runtimeState.js';
import { PrometheusMetrics } from '../services/metricsCollector.js';
import { withServer, jsonRequest } from '../test-utils/httpTestUtils.js';

test('cookie-authenticated writes require matching CSRF token and trusted production origin', async () => {
  const app = express();
  app.use(correlationIdMiddleware);
  app.use(createCsrfProtection({
    isProduction: true,
    allowedOrigins: ['https://app.wealthgenie.example'],
  }));
  app.post('/write', (_req, res) => res.json({ ok: true }));

  const cookie = 'wg_session=session-token; wg_csrf=csrf-token';
  await withServer(app, async (baseUrl) => {
    const missingToken = await jsonRequest(`${baseUrl}/write`, {
      method: 'POST',
      headers: { cookie, origin: 'https://app.wealthgenie.example' },
    });
    assert.equal(missingToken.response.status, 403);
    assert.equal(missingToken.body.code, 'CSRF_TOKEN_INVALID');

    const hostileOrigin = await jsonRequest(`${baseUrl}/write`, {
      method: 'POST',
      headers: { cookie, origin: 'https://evil.example', 'x-csrf-token': 'csrf-token' },
    });
    assert.equal(hostileOrigin.response.status, 403);
    assert.equal(hostileOrigin.body.code, 'CSRF_ORIGIN_INVALID');

    const accepted = await jsonRequest(`${baseUrl}/write`, {
      method: 'POST',
      headers: {
        cookie,
        origin: 'https://app.wealthgenie.example',
        'x-csrf-token': 'csrf-token',
      },
    });
    assert.equal(accepted.response.status, 200);
  });
});

test('admission control rejects excess concurrent traffic and records bounded metrics', async () => {
  const runtimeState = createRuntimeState();
  runtimeState.markReady();
  const app = express();
  app.use(correlationIdMiddleware);
  app.use(createOperationalMiddleware({ runtimeState, maxInFlightRequests: 1 }));

  let releaseRequest;
  let markEntered;
  const entered = new Promise(resolve => { markEntered = resolve; });
  const release = new Promise(resolve => { releaseRequest = resolve; });
  app.get('/slow', async (_req, res) => {
    markEntered();
    await release;
    res.json({ ok: true });
  });

  await withServer(app, async (baseUrl) => {
    const first = fetch(`${baseUrl}/slow`);
    await entered;
    const overloaded = await jsonRequest(`${baseUrl}/slow`);
    assert.equal(overloaded.response.status, 503);
    assert.equal(overloaded.body.code, 'SERVICE_OVERLOADED');
    assert.equal(overloaded.response.headers.get('retry-after'), '1');

    releaseRequest();
    assert.equal((await first).status, 200);
  });

  const snapshot = PrometheusMetrics.getSnapshotJSON();
  assert.ok(snapshot.http.overload_total >= 1);
  assert.ok(snapshot.http.in_flight_peak >= 1);
  assert.match(PrometheusMetrics.getPrometheusFormat(), /wealthgenie_http_requests_total/);
});

test('application traffic is rejected until bootstrap marks the runtime ready', async () => {
  const runtimeState = createRuntimeState();
  const app = express();
  app.use(correlationIdMiddleware);
  app.use(createOperationalMiddleware({ runtimeState, maxInFlightRequests: 10 }));
  app.get('/work', (_req, res) => res.json({ ok: true }));

  await withServer(app, async (baseUrl) => {
    const starting = await jsonRequest(`${baseUrl}/work`);
    assert.equal(starting.response.status, 503);
    assert.equal(starting.body.code, 'SERVICE_NOT_READY');

    runtimeState.markReady();
    const ready = await jsonRequest(`${baseUrl}/work`);
    assert.equal(ready.response.status, 200);
  });
});
