import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import Joi from 'joi';
import { verifyJWT } from '../middleware/authMiddleware.js';
import { correlationIdMiddleware } from '../middleware/correlation.js';
import {
  createError,
  errorHandler,
  sendError,
} from '../middleware/errorHandler.js';
import { validate } from '../validation/schemas.js';
import { jsonRequest, withServer } from '../test-utils/httpTestUtils.js';

process.env.JWT_SECRET = 'error-contract-test-secret-with-32-characters';

const requiredErrorKeys = ['code', 'error', 'message', 'request_id'];

function assertCanonicalError(body, expectedCode) {
  for (const key of requiredErrorKeys) assert.ok(Object.hasOwn(body, key), `missing ${key}`);
  assert.equal(body.code, expectedCode);
  assert.equal(body.error, body.message);
  assert.match(body.request_id, /^[0-9a-f-]{36}$/i);
}

function buildApp() {
  const app = express();
  app.use(correlationIdMiddleware);
  app.use(express.json());
  app.post('/validated', validate(Joi.object({ amount: Joi.number().positive().required() })), (_req, res) => res.sendStatus(204));
  app.get('/protected', verifyJWT, (_req, res) => res.sendStatus(204));
  app.get('/failure', (_req, _res, next) => next(createError(
    500,
    'database password=must-never-leak',
    'The operation could not be completed.',
    { code: 'OPERATION_FAILED' },
  )));
  app.use((req, res) => sendError(req, res, 404, 'Route not found.', 'ROUTE_NOT_FOUND'));
  app.use(errorHandler);
  return app;
}

test('validation, authentication, routing, and server failures share one safe envelope', async () => {
  await withServer(buildApp(), async (baseUrl) => {
    const validation = await jsonRequest(`${baseUrl}/validated`, {
      method: 'POST',
      body: JSON.stringify({ amount: -1 }),
    });
    assert.equal(validation.response.status, 400);
    assertCanonicalError(validation.body, 'VALIDATION_ERROR');
    assert.ok(Array.isArray(validation.body.details));

    const auth = await jsonRequest(`${baseUrl}/protected`);
    assert.equal(auth.response.status, 401);
    assertCanonicalError(auth.body, 'AUTH_REQUIRED');

    const missing = await jsonRequest(`${baseUrl}/missing`);
    assert.equal(missing.response.status, 404);
    assertCanonicalError(missing.body, 'ROUTE_NOT_FOUND');

    const failure = await jsonRequest(`${baseUrl}/failure`);
    assert.equal(failure.response.status, 500);
    assertCanonicalError(failure.body, 'OPERATION_FAILED');
    assert.doesNotMatch(JSON.stringify(failure.body), /password|must-never-leak/);
  });
});
