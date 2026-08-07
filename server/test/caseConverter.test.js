import test from 'node:test';
import assert from 'node:assert/strict';
import { toCamelCase, toSnakeCase } from '../utils/caseConverter.js';

test('WG-012: toCamelCase converts object keys from snake_case recursively', () => {
  const input = {
    monthly_income: 50000,
    risk_tolerance: 'Moderate',
    nested_data: {
      lump_sum_amount: 100000,
      tags_list: ['a_b', 'c_d'],
    },
  };

  const expected = {
    monthlyIncome: 50000,
    riskTolerance: 'Moderate',
    nestedData: {
      lumpSumAmount: 100000,
      tagsList: ['a_b', 'c_d'],
    },
  };

  assert.deepEqual(toCamelCase(input), expected);
});

test('WG-012: toSnakeCase converts object keys from camelCase recursively', () => {
  const input = {
    monthlyIncome: 50000,
    riskTolerance: 'Moderate',
    nestedData: {
      lumpSumAmount: 100000,
    },
  };

  const expected = {
    monthly_income: 50000,
    risk_tolerance: 'Moderate',
    nested_data: {
      lump_sum_amount: 100000,
    },
  };

  assert.deepEqual(toSnakeCase(input), expected);
});
