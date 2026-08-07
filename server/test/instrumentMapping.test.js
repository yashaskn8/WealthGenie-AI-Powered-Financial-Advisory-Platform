import test from 'node:test';
import assert from 'node:assert/strict';
import { LEGACY_TYPE_MAP, mapCategoryToLegacyType } from '../config/instrumentMapping.js';

test('WG-016/WG-017: LEGACY_TYPE_MAP is consolidated and maps categories correctly', () => {
  assert.ok(LEGACY_TYPE_MAP, 'LEGACY_TYPE_MAP must be defined');
  assert.equal(mapCategoryToLegacyType('Government'), 'Government');
  assert.equal(mapCategoryToLegacyType('Gold'), 'Gold');
  assert.equal(mapCategoryToLegacyType('Fixed Deposit'), 'FD');
  assert.equal(mapCategoryToLegacyType('Equity'), 'Mutual_Fund');
  assert.equal(mapCategoryToLegacyType('UnknownCategory'), 'Mutual_Fund');
});
