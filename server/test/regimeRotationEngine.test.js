import test from 'node:test';
import assert from 'node:assert/strict';
import { getCurrentRegime, getRegimeTilts, calculateTiltAdjustedAllocation, MACRO_REGIMES } from '../services/regimeRotationEngine.js';

test('1. getCurrentRegime returns valid default or overridden regime', () => {
  const currentDefault = getCurrentRegime();
  assert.equal(currentDefault.key, 'geopolitical_conflict');
  assert.equal(currentDefault.title, 'Geopolitical Conflict & Supply Disruption');

  const override = getCurrentRegime('pandemic_health_crisis');
  assert.equal(override.key, 'pandemic_health_crisis');
  assert.equal(override.title, 'Health Emergency & Lockdown Shock');
});

test('2. getRegimeTilts returns correct tilt mappings', () => {
  const conflictTilts = getRegimeTilts('geopolitical_conflict');
  assert(conflictTilts.tilts.defence, 'Geopolitical conflict must include defence tilt');
  assert.equal(conflictTilts.tilts.defence.weightDelta, 0.15);

  const crashTilts = getRegimeTilts('broad_market_crash');
  assert(crashTilts.tilts.liquid_mf, 'Market crash must include liquid fund tilt');
  assert.equal(crashTilts.tilts.liquid_mf.weightDelta, 0.25);
});

test('3. calculateTiltAdjustedAllocation applies sector weight adjustments and normalizes', () => {
  const baseWeights = {
    defence: 0.10,
    energy_oil_gas: 0.10,
    auto: 0.20,
    other: 0.60
  };

  const result = calculateTiltAdjustedAllocation(baseWeights, 'geopolitical_conflict');

  assert.equal(result.regime, 'geopolitical_conflict');
  assert(result.adjustedWeights.defence > baseWeights.defence, 'Defence weight must increase in conflict regime');
  assert(result.adjustedWeights.auto < baseWeights.auto, 'Auto weight must decrease in conflict regime');

  // Verify normalized weights sum to 1.0 (with floating-point precision tolerance)
  const sum = Object.values(result.adjustedWeights).reduce((a, b) => a + b, 0);
  assert(Math.abs(sum - 1.0) < 0.02, `Normalized weights sum (${sum}) must be approximately 1.0`);
});
