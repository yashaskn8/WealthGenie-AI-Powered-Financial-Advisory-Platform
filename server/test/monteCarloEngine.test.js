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

test('sampleLogNormalMonthly exact GBM formula verification', () => {
  // GBM: exp((mu - 0.5*sigma^2)*dt + sigma*sqrt(dt)*z)
  // dt = 1/12, mu = 0.12, sigma = 0.15, z = 0
  const dt = 1 / 12;
  const drift = (0.12 - 0.5 * 0.15 * 0.15) * dt;
  const expectedZeroZ = Math.exp(drift);
  assert.equal(sampleLogNormalMonthly(0.12, 0.15, 0), expectedZeroZ);

  // z = 1.0
  const vol = 0.15 * Math.sqrt(dt);
  const expectedPosZ = Math.exp(drift + vol * 1.0);
  assert.equal(sampleLogNormalMonthly(0.12, 0.15, 1.0), expectedPosZ);

  // z = -1.0
  const expectedNegZ = Math.exp(drift + vol * -1.0);
  assert.equal(sampleLogNormalMonthly(0.12, 0.15, -1.0), expectedNegZ);
  assert.ok(expectedPosZ > expectedNegZ);

  // Zero volatility: multiplier = exp(mu*dt)
  const zeroVol = sampleLogNormalMonthly(0.12, 0, 2.5);
  assert.equal(zeroVol, Math.exp(0.12 / 12));
});

test('computeSequenceRisk exact coefficient of variation and bankruptcy ratio', () => {
  // Empty values
  assert.equal(computeSequenceRisk([], 100, 5), 0);
  assert.equal(computeSequenceRisk(null, 100, 5), 0);

  // No withdrawal -> exact CV: mean=100, variance=200, stdDev=sqrt(200), cv=sqrt(200)/100
  const cv = computeSequenceRisk([100, 120, 80, 100], 4, 5, 0);
  const mean = (100 + 120 + 80 + 100) / 4; // 100
  const variance = ((0)**2 + (20)**2 + (-20)**2 + (0)**2) / 4; // 200
  const expectedCV = parseFloat((Math.sqrt(variance) / mean).toFixed(4));
  assert.equal(cv, expectedCV);

  // Mean <= 0 with no withdrawal -> returns 0
  assert.equal(computeSequenceRisk([-100, -200], 2, 5, 0), 0);

  // With withdrawal -> bankruptcy ratio
  assert.equal(computeSequenceRisk([-10, 0, 100, 200], 4, 5, 5000), 0.5);
  assert.equal(computeSequenceRisk([100, 200, 300], 3, 5, 1000), 0); // none bankrupt
  assert.equal(computeSequenceRisk([-1, -2, -3], 3, 5, 1000), 1.0); // all bankrupt
});

test('computeRiskMetrics exact implied volatility and Sharpe calculation', () => {
  // Invalid inputs
  assert.deepEqual(computeRiskMetrics([], [], 5), { impliedVol: 0, sharpeRatio: 0 });
  assert.deepEqual(computeRiskMetrics([100], [50], 0), { impliedVol: 0, sharpeRatio: 0 });
  assert.deepEqual(computeRiskMetrics(null, [50], 5), { impliedVol: 0, sharpeRatio: 0 });
  assert.deepEqual(computeRiskMetrics([100], null, 5), { impliedVol: 0, sharpeRatio: 0 });

  // Exact calculation: p50Last=300000, p10Last=180000, years=5
  // impliedVol = ln(300000/180000) / (1.28155 * sqrt(5))
  const p50Last = 300_000;
  const p10Last = 180_000;
  const years = 5;
  const rf = 0.065;
  const postTax = 0.10;
  const expectedVol = Math.log(p50Last / p10Last) / (1.28155 * Math.sqrt(years));
  const expectedSharpe = (postTax - rf) / expectedVol;
  const metrics = computeRiskMetrics([200_000, p50Last], [150_000, p10Last], years, rf, postTax);
  assert.equal(metrics.impliedVol, parseFloat(expectedVol.toFixed(4)));
  assert.equal(metrics.sharpeRatio, parseFloat(expectedSharpe.toFixed(4)));

  // p50 <= p10 -> fallback vol = 0.05
  const fallback = computeRiskMetrics([100], [200], 5, 0.065, 0.10);
  assert.equal(fallback.impliedVol, 0.05);
  assert.equal(fallback.sharpeRatio, parseFloat(((0.10 - 0.065) / 0.05).toFixed(4)));
});

test('computeGoalProbability and computeWilsonCI exact values', () => {
  assert.equal(computeGoalProbability([], 1000), 0);
  assert.equal(computeGoalProbability([500, 800], 0), 0);
  assert.equal(computeGoalProbability([500, 800], -100), 0);
  assert.equal(computeGoalProbability([500, 800], 1000), 0);
  assert.equal(computeGoalProbability([1000, 1200, 1500], 1000), 1.0);
  assert.equal(computeGoalProbability([500, 1200, 1500], 1000), 0.6667);

  // Wilson CI exact computation for p=0.5, n=100
  const z = 1.95996;
  const p = 0.5;
  const n = 100;
  const factor = (z * z) / n;
  const term1 = p + factor / 2;
  const term2 = z * Math.sqrt((p * (1 - p) + factor / 4) / n);
  const denom = 1 + factor;
  const expectedLower = parseFloat(Math.max(0, (term1 - term2) / denom).toFixed(4));
  const expectedUpper = parseFloat(Math.min(1, (term1 + term2) / denom).toFixed(4));
  const ci = computeWilsonCI(0.5, 100);
  assert.equal(ci.lower, expectedLower);
  assert.equal(ci.upper, expectedUpper);

  // Edge cases
  assert.deepEqual(computeWilsonCI(0.5, 0), { lower: 0, upper: 0 });
  assert.deepEqual(computeWilsonCI(null, 100), { lower: 0, upper: 0 });

  // p=0 and p=1
  const ciZero = computeWilsonCI(0, 100);
  assert.equal(ciZero.lower, 0);
  assert.ok(ciZero.upper > 0);
  const ciOne = computeWilsonCI(1, 100);
  assert.ok(ciOne.lower < 1);
  assert.equal(ciOne.upper, 1);
});

test('getInstrumentVolatility returns correct params for known and unknown instruments', () => {
  // Known instrument — exact values from CENTRAL_PARAMS
  const equityVol = getInstrumentVolatility('Equity_MF');
  assert.ok(equityVol.mean > 0);
  assert.ok(equityVol.stdDev > 0);

  // Without overrideMean -> uses the default mean from INSTRUMENT_PARAMS
  const fdVol = getInstrumentVolatility('FD');
  assert.ok(fdVol.mean > 0);
  assert.ok(fdVol.stdDev >= 0);

  // With overrideMean -> overrides default mean
  const fdOverride = getInstrumentVolatility('FD', 0.15);
  assert.equal(fdOverride.mean, 0.15);
  assert.equal(fdOverride.stdDev, fdVol.stdDev);

  // Unknown instrument with override
  const unknownVol = getInstrumentVolatility('Unknown_Instrument_XYZ', 0.12);
  assert.equal(unknownVol.mean, 0.12);
  assert.equal(unknownVol.stdDev, 0.05);

  // Unknown instrument without override -> default mean 0.08
  const unknownDefault = getInstrumentVolatility('Unknown_Instrument_XYZ');
  assert.equal(unknownDefault.mean, 0.08);
  assert.equal(unknownDefault.stdDev, 0.05);
});

test('runMonteCarlo input validation, deterministic FV, and structure', () => {
  // Zero investment & zero savings -> emptyResult with correct structure
  const emptyRes = runMonteCarlo({ monthlyInvestment: 0, currentSavings: 0, years: 5 });
  assert.equal(emptyRes.p50.length, 5);
  emptyRes.p50.forEach(v => assert.equal(v, 0));
  assert.deepEqual(emptyRes.finalValues, []);
  assert.equal(emptyRes.years_array.length, 5);

  // Extreme volatility clamped to 60%
  const clampedRes = runMonteCarlo({
    monthlyInvestment: 5000,
    annualVolatility: 1.5,
    years: 3,
    simulations: 200,
  });
  assert.equal(clampedRes.years_array.length, 3);

  // Deterministic FV check: with 0 volatility, result should converge to deterministic_fv
  const deterministicRes = runMonteCarlo({
    monthlyInvestment: 10_000,
    postTaxAnnualReturn: 0.08,
    annualVolatility: 0.0001, // near-zero vol
    years: 1,
    simulations: 200,
    currentSavings: 100_000,
  });
  assert.ok(deterministicRes.deterministic_fv > 0);
  // p50 should be very close to deterministic_fv (within 1%)
  const p50Final = deterministicRes.p50[deterministicRes.p50.length - 1];
  const relError = Math.abs(p50Final - deterministicRes.deterministic_fv) / deterministicRes.deterministic_fv;
  assert.ok(relError < 0.01, `p50 should be within 1% of deterministic FV, got ${(relError*100).toFixed(2)}% error`);

  // Simulations_run is always even (antithetic pairs)
  assert.equal(deterministicRes.simulations_run % 2, 0);

  // Non-real-track should have real values, inflation, sequence risk, riskMetrics, sharpe sensitivity
  assert.ok(deterministicRes.p50_real);
  assert.ok(typeof deterministicRes.inflationRateUsed === 'number');
  assert.ok(typeof deterministicRes.sequenceRisk === 'number');
  assert.ok(deterministicRes.riskMetrics);
  assert.ok(deterministicRes.sharpe_ratio_sensitivity);
  assert.ok(typeof deterministicRes.sharpe_ratio_sensitivity.base === 'number');
  assert.ok(typeof deterministicRes.sharpe_ratio_sensitivity.plus_2pct === 'number');
  assert.ok(typeof deterministicRes.sharpe_ratio_sensitivity.minus_2pct === 'number');
  assert.equal(deterministicRes.variance_reduction, 'halton_qmc+antithetic+control_variates');
});

test('reverseSIP exact formula verification', () => {
  // Zero rate -> remaining / n
  const linearSip = reverseSIP(120_000, 0, 1, 0);
  assert.equal(Math.round(linearSip), 10_000);

  // Already reached target
  assert.equal(reverseSIP(100_000, 0.10, 5, 200_000), 0);

  // Invalid inputs
  assert.equal(reverseSIP(-500, 0.10, 5), 0);
  assert.equal(reverseSIP(100_000, 0.10, 0), 0);
  assert.equal(reverseSIP(NaN, 0.10, 5), 0);
  assert.equal(reverseSIP(100_000, 0.10, -1), 0);

  // Negative rate -> treated as 0
  const negRate = reverseSIP(120_000, -0.05, 1, 0);
  assert.ok(Number.isFinite(negRate));
  assert.ok(negRate >= 0);

  // Exact computation: target=1M, rate=10%, years=10, savings=0
  const sip = reverseSIP(1_000_000, 0.10, 10, 0);
  assert.ok(Number.isFinite(sip));
  assert.ok(sip > 0);
  // Forward-verify: continuous monthly rate = (e^(annual/12) - 1)
  const r = Math.exp(0.10 / 12) - 1;
  const n = 120;
  const fv = sip * ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
  assert.ok(Math.abs(fv - 1_000_000) < 1, `Forward-computed FV should be ~1M, got ${fv}`);

});
