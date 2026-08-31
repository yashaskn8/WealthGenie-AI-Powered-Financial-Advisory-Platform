/**
 * Tier 4 â€” Observability & Health Integration Tests
 *
 * Tests:
 *   1. Correlation ID generated automatically if not provided
 *   2. Correlation ID preserved and echoed when provided
 *   3. Deep Health Check returns correct structure with DB UP
 *   4. Deep Health Check returns 503 DOWN when MongoDB is disconnected
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import mongoose from 'mongoose';
import healthRoutes from '../routes/health.js';
import { correlationIdMiddleware } from '../middleware/correlation.js';
import { errorHandler } from '../middleware/errorHandler.js';
import { setupTestDatabase, teardownTestDatabase } from './helpers/mongoTestHelper.js';

process.env.NODE_ENV = 'test';

function buildApp() {
  const app = express();
  app.use(correlationIdMiddleware);
  app.use('/health', healthRoutes);
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

// Ensure DB is connected
async function ensureDb() {
  await setupTestDatabase();
}

test.after(async () => {
  await teardownTestDatabase();
});


// â”€â”€ 1. Correlation ID: auto-generated â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
test('Observability: correlation ID generated automatically if missing', async () => {
  await withServer(async (baseUrl) => {
    // Use simple /health (always returns 200) to test correlation ID
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    const headerCid = response.headers.get('x-correlation-id');
    assert.ok(headerCid, 'X-Correlation-ID response header must exist');
    assert.ok(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(headerCid),
      `Must be a valid UUID, got: ${headerCid}`
    );
  });
});

// â”€â”€ 2. Correlation ID: echo back provided ID â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
test('Observability: correlation ID propagated if provided in request', async () => {
  const customCid = 'test-trace-token-9988-7766';
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`, {
      headers: { 'x-correlation-id': customCid },
    });
    assert.equal(response.status, 200);
    const headerCid = response.headers.get('x-correlation-id');
    assert.equal(headerCid, customCid, 'Response header must echo the request correlation ID');
  });
});

test('Observability: malformed correlation and trace headers are replaced safely', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`, {
      headers: {
        'x-correlation-id': 'invalid id with spaces',
        traceparent: 'not-a-valid-traceparent',
      },
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('x-correlation-id'), /^[0-9a-f-]{36}$/i);
    assert.equal(response.headers.get('x-request-id'), response.headers.get('x-correlation-id'));
    assert.match(response.headers.get('traceparent'), /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/);
  });
});

// â”€â”€ 3. Deep health check: structure and DB status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
test('Observability: deep health check returns correct structure with DB UP', async () => {
  await ensureDb();
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health/deep`);
    const body = await response.json();

    // Verify structure regardless of overall status
    assert.ok(body.timestamp, 'Response must include timestamp');
    assert.ok(body.services, 'Response must include services object');
    assert.ok(['UP', 'DOWN'].includes(body.services.database), 'database must be UP or DOWN');
    assert.ok(['UP', 'DOWN'].includes(body.services.redis), 'redis must be UP or DOWN');
    assert.ok(['UP', 'DOWN'].includes(body.services.ml), 'ml must be UP or DOWN');

    // DB should be UP since we connected
    assert.equal(body.services.database, 'UP', 'Database must be UP after ensureDb()');

    // Overall status: UP if all UP, DEGRADED if non-critical DOWN, DOWN (503) only if DB DOWN
    const allUp = Object.values(body.services).every(s => s === 'UP');
    const dbDown = body.services.database === 'DOWN';
    if (dbDown) {
      assert.equal(response.status, 503);
      assert.equal(body.status, 'DOWN');
    } else if (allUp) {
      assert.equal(response.status, 200);
      assert.equal(body.status, 'UP');
    } else {
      // Non-critical services degraded - still 200
      assert.equal(response.status, 200);
      assert.equal(body.status, 'DEGRADED');
    }
  });
});

// â”€â”€ 4. Deep health check: DB disconnected â†’ 503 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
test('Observability: deep health check returns 503 DOWN when MongoDB is disconnected', async (t) => {
  await ensureDb();

  Object.defineProperty(mongoose.connection, 'readyState', {
    get: () => 0,
    configurable: true,
  });

  t.after(() => {
    delete mongoose.connection.readyState;
  });

  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health/deep`);
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.status, 'DOWN');
    assert.equal(body.services.database, 'DOWN');
  });
});
