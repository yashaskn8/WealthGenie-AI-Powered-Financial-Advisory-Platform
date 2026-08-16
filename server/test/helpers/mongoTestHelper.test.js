import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import {
  setupTestDatabase,
  teardownTestDatabase,
  getActiveDbMechanism,
  getActiveDbUri,
} from './mongoTestHelper.js';

test('mongoTestHelper: provisions database and connects Mongoose', async () => {
  // Test fallback/default mechanism
  const db = await setupTestDatabase();
  assert.ok(db.uri, 'Should return a valid URI');
  assert.ok(getActiveDbMechanism(), 'Should report active mechanism');
  assert.strictEqual(mongoose.connection.readyState, 1, 'Mongoose should be connected');
  assert.ok(getActiveDbUri(), 'Should report active URI');

  await teardownTestDatabase();
  assert.strictEqual(mongoose.connection.readyState, 0, 'Mongoose should be disconnected after teardown');
  assert.strictEqual(getActiveDbMechanism(), null, 'Active mechanism should be reset');
});

test('mongoTestHelper: fail-fast mode produces descriptive actionable error when all mechanisms disabled', async () => {
  const origTestcontainers = process.env.USE_TESTCONTAINERS;
  const origMms = process.env.USE_MMS;
  const origUri = process.env.MONGODB_URI;

  try {
    process.env.USE_TESTCONTAINERS = 'false';
    process.env.USE_MMS = 'false';
    delete process.env.MONGODB_URI;
    delete process.env.MONGO_URI;

    await assert.rejects(
      async () => {
        await setupTestDatabase();
      },
      (err) => {
        assert.match(err.message, /\[WealthGenie Test Setup Error\]/);
        assert.match(err.message, /Scenario A/);
        assert.match(err.message, /Scenario B/);
        assert.match(err.message, /Scenario C/);
        return true;
      }
    );
  } finally {
    if (origTestcontainers !== undefined) process.env.USE_TESTCONTAINERS = origTestcontainers;
    else delete process.env.USE_TESTCONTAINERS;

    if (origMms !== undefined) process.env.USE_MMS = origMms;
    else delete process.env.USE_MMS;

    if (origUri !== undefined) process.env.MONGODB_URI = origUri;
    else delete process.env.MONGODB_URI;
  }
});
