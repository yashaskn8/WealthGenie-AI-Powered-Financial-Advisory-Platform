import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import regimeRoutes from '../routes/regime.js';
import { withServer, jsonRequest } from '../test-utils/httpTestUtils.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/regime', regimeRoutes);
  return app;
}

test('regime routes reject unknown regimes instead of silently using a default', async () => {
  await withServer(buildApp(), async (baseUrl) => {
    const { response, body } = await jsonRequest(`${baseUrl}/api/regime/current?regime=attacker_value`);
    assert.equal(response.status, 400);
    assert.equal(body.error, 'Validation failed');
  });
});

test('regime adjustment validates bounded numeric weights', async () => {
  await withServer(buildApp(), async (baseUrl) => {
    const { response, body } = await jsonRequest(`${baseUrl}/api/regime/adjust`, {
      method: 'POST',
      body: JSON.stringify({
        baseWeights: { equity: 0.7, debt: 0.3 },
        regimeKey: 'normal',
      }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(body.adjustedWeights, { equity: 0.7, debt: 0.3 });

    const invalid = await jsonRequest(`${baseUrl}/api/regime/adjust`, {
      method: 'POST',
      body: JSON.stringify({ baseWeights: { equity: 50 }, regimeKey: 'normal' }),
    });
    assert.equal(invalid.response.status, 400);
    assert.equal(invalid.body.error, 'Validation failed');
  });
});
