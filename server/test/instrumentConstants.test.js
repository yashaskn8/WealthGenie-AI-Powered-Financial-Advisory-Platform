import test from 'node:test';
import assert from 'node:assert/strict';
import { INSTRUMENT_PARAMS, RISK_FREE_RATE, CESS_RATE } from '../services/instrumentConstants.js';

test('WG-015: Single source of truth for instrument parameters and rates', () => {
  assert.ok(INSTRUMENT_PARAMS, 'INSTRUMENT_PARAMS must be defined');
  assert.ok(INSTRUMENT_PARAMS.Equity_MF, 'Equity_MF parameters must exist in single source of truth');
  assert.equal(typeof RISK_FREE_RATE, 'number', 'RISK_FREE_RATE must be a number');
  assert.equal(CESS_RATE, 0.04, 'CESS_RATE must equal 0.04 (4% Health & Education Cess)');
  assert.equal(INSTRUMENT_PARAMS.Equity_MF.nominalRate, 12.5, 'Equity_MF nominal rate must be 12.5% in single source of truth');
});
