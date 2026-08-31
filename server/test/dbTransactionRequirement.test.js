import test from 'node:test';
import assert from 'node:assert/strict';
import { assertMongoTransactionCapability } from '../config/db.js';

function connectionReturning(hello) {
  return {
    connection: {
      db: {
        admin: () => ({ command: async () => hello }),
      },
    },
  };
}

test('production transaction capability accepts a MongoDB replica set', async () => {
  assert.equal(await assertMongoTransactionCapability(connectionReturning({ setName: 'rs0' })), 'rs0');
});

test('production transaction capability rejects standalone MongoDB', async () => {
  await assert.rejects(
    assertMongoTransactionCapability(connectionReturning({ isWritablePrimary: true })),
    error => error.code === 'MONGODB_TRANSACTIONS_REQUIRED'
      && /replica set.*transactions/i.test(error.message),
  );
});

