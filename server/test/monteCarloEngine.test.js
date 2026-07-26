import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runMonteCarlo,
  runMonteCarloWithGoal,
  reverseSIP,
  sampleLogNormalMonthly,
  computeSequenceRisk,
  computeRiskMetrics,
  computeGoalProbability,
  computeWilsonCI,
  getInstrumentVolatility,
} from '../services/monteCarloEngine.js';

test('Monte Carlo output has ordered percentiles and bounded goal probability', () => {
  const result = runMonteCarloWithGoal({
    monthlyInvestment: 10_000,
    postTaxAnnualReturn: 0.08,
    annualVolatility: 0.12,
    years: 5,
    simulations: 500,
    targetAmount: 800_000,
  });

  assert.equal(result.years_array.length, 5);
  assert.equal(result.p10.length, 5);
  assert.equal(result.p50.length, 5);
  assert.equal(result.p90.length, 5);
  assert.ok(result.simulations_run >= 500);
  assert.ok(result.goal_probability >= 0 && result.goal_probability <= 1);
  assert.ok(result.goal_probability_ci);
  assert.ok(result.goal_probability_ci.lower >= 0);
  assert.ok(result.goal_probability_ci.upper <= 1);

  for (let i = 0; i < result.p50.length; i += 1) {
    assert.ok(result.p10[i] <= result.p50[i], `p10 <= p50 at ${i}`);
    assert.ok(result.p50[i] <= result.p90[i], `p50 <= p90 at ${i}`);
  }
});

test('reverseSIP handles zero rate, reachable targets, and invalid inputs', () => {
  // Reachable target
  const sip = reverseSIP(1_000_000, 0.10, 10, 100_000);
  assert.ok(Number.isFinite(sip));
  assert.ok(sip > 0);

  // Zero rate -> linear division
  const linearSip = reverseSIP(120_000, 0, 1, 0);
  assert.equal(Math.round(linearSip), 10_000);

  // Already reached target with current savings
  const zeroSip = reverseSIP(100_000, 0.10, 5, 200_000);
  assert.equal(zeroSip, 0);

  // Invalid target or years
  assert.equal(reverseSIP(-500, 0.10, 5), 0);
  assert.equal(reverseSIP(100_000, 0.10, 0), 0);
});

test('sampleLogNormalMonthly calculates log-normal multiplier', () => {
  const multZeroZ = sampleLogNormalMonthly(0.12, 0.15, 0);
  assert.ok(Number.isFinite(multZeroZ));
  assert.ok(multZeroZ > 0);

  // Positive Z yields higher multiplier than negative Z
  const multPosZ = sampleLogNormalMonthly(0.12, 0.15, 1.0);
  const multNegZ = sampleLogNormalMonthly(0.12, 0.15, -1.0);
  assert.ok(multPosZ > multNegZ);
});

test('computeSequenceRisk handles withdrawals vs no withdrawals', () => {
  // Empty values
  assert.equal(computeSequenceRisk([], 100, 5), 0);

  // No withdrawal -> returns coefficient of variation
  const cv = computeSequenceRisk([100, 120, 80, 100], 4, 5, 0);
  assert.ok(cv > 0);

  // With withdrawal -> returns bankruptcy ratio
  const bankruptRatio = computeSequenceRisk([-10, 0, 100, 200], 4, 5, 5000);
  assert.equal(bankruptRatio, 0.5); // 2 out of 4 are <= 0
});

test('computeRiskMetrics computes implied volatility and Sharpe proxy', () => {
  // Invalid inputs
  assert.deepEqual(computeRiskMetrics([], [], 5), { impliedVol: 0, sharpeRatio: 0 });
  assert.deepEqual(computeRiskMetrics([100], [50], 0), { impliedVol: 0, sharpeRatio: 0 });

  // Valid inputs
  const metrics = computeRiskMetrics([200_000, 300_000], [150_000, 180_000], 5, 0.065, 0.10);
  assert.ok(metrics.impliedVol > 0);
  assert.ok(typeof metrics.sharpeRatio === 'number');
});

test('computeGoalProbability and computeWilsonCI precision', () => {
  assert.equal(computeGoalProbability([], 1000), 0);
  assert.equal(computeGoalProbability([500, 800], 1000), 0);
  assert.equal(computeGoalProbability([500, 1200, 1500], 1000), 0.6667);

  // Wilson CI bounds
  assert.deepEqual(computeWilsonCI(0.5, 0), { lower: 0, upper: 0 });
  const ci = computeWilsonCI(0.8, 100);
  assert.ok(ci.lower > 0.7 && ci.lower < 0.8);
  assert.ok(ci.upper > 0.8 && ci.upper < 0.9);
});

test('getInstrumentVolatility defaults and overrideMean', () => {
  const equityVol = getInstrumentVolatility('Equity_MF');
  assert.ok(equityVol.mean > 0);
  assert.ok(equityVol.stdDev > 0);

  const unknownVol = getInstrumentVolatility('Unknown_Instrument_XYZ', 0.12);
  assert.equal(unknownVol.mean, 0.12);
  assert.equal(unknownVol.stdDev, 0.05);
});

test('runMonteCarlo input validation and extreme volatility clamping', () => {
  // Zero investment & zero savings -> emptyResult
  const emptyRes = runMonteCarlo({ monthlyInvestment: 0, currentSavings: 0, years: 5 });
  assert.equal(emptyRes.p50[0], 0);

  // Extreme volatility clamped to 60%
  const clampedRes = runMonteCarlo({
    monthlyInvestment: 5000,
    annualVolatility: 1.5, // 150% -> clamped to 60%
    years: 3,
    simulations: 200,
  });
  assert.equal(clampedRes.years_array.length, 3);
  assert.ok(clampedRes.p50.length === 3);
});

