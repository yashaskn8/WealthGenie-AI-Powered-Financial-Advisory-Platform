import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeRebalance,
  optimisePortfolio,
  solveMinVariance,
  solveMaxSharpe,
  solveRiskParity,
  buildCovarianceMatrix,
  resolveAssetKey,
} from '../services/portfolioEngine.js';

const ASSETS = ['Equity_MF', 'Debt_MF', 'Gold'];
const RETURNS = [0.10, 0.06, 0.08];

function assertWeights(result) {
  const weights = Object.values(result.weights);
  const sum = weights.reduce((acc, value) => acc + value, 0);
  assert.ok(Math.abs(sum - 1) < 0.00001, `weights sum=${sum}`);
  assert.ok(weights.every(value => value >= 0));
  assert.ok(Number.isFinite(result.expectedReturn));
  assert.ok(Number.isFinite(result.volatility));
  assert.ok(Number.isFinite(result.sharpe));
}

test('portfolio optimizer returns complete metrics for every exposed strategy', () => {
  for (const strategy of ['min_variance', 'max_sharpe', 'risk_parity']) {
    const result = optimisePortfolio(ASSETS, RETURNS, strategy);
    assert.equal(result.strategy, strategy);
    assertWeights(result);
  }

  // Error case: unknown strategy
  assert.throws(
    () => optimisePortfolio(ASSETS, RETURNS, 'invalid_strategy'),
    /Unknown optimisation strategy "invalid_strategy"/
  );
});

test('buildCovarianceMatrix handles aliases, unknown assets, and empty inputs', () => {
  // Empty assets error
  assert.throws(() => buildCovarianceMatrix([]), /assetKeys must be non-empty/);

  // Aliases (SCSS -> FD, SSY -> PPF, Gold_Physical -> Gold, Balanced_Advantage -> Hybrid_MF)
  const covRes = buildCovarianceMatrix(['SCSS', 'SSY', 'Gold_Physical', 'Balanced_Advantage']);
  assert.equal(covRes.matrix.length, 4);
  assert.equal(covRes.assetKeys.length, 4);

  // Unknown asset key fallback
  const covUnknown = buildCovarianceMatrix(['Unknown_Asset_Class_XYZ']);
  assert.equal(covUnknown.matrix.length, 1);
});

test('optimizer edge cases: mismatched lengths, negative/zero excess returns', () => {
  // Length mismatch in solveMinVariance & solveMaxSharpe
  assert.throws(
    () => solveMinVariance(['Equity_MF', 'Debt_MF'], [0.10]),
    /postTaxReturns length \(1\) must match assetKeys length \(2\)/
  );

  // All returns below risk free rate (fallback to min variance)
  const lowReturns = [0.01, 0.02, 0.01]; // risk-free rate is ~0.065
  const maxSharpeRes = solveMaxSharpe(ASSETS, lowReturns);
  assertWeights(maxSharpeRes);
});

test('solveRiskParity computes valid risk contributions and metrics', () => {
  const rpRes = solveRiskParity(ASSETS);
  assert.ok(rpRes.volatility > 0);
  assert.ok(rpRes.riskContributions);
  ASSETS.forEach(k => {
    assert.ok(typeof rpRes.riskContributions[k] === 'number');
  });

  // Risk parity in optimisePortfolio
  const optRp = optimisePortfolio(ASSETS, RETURNS, 'risk_parity');
  assert.equal(optRp.strategy, 'risk_parity');
  assert.ok(typeof optRp.expectedReturn === 'number');
  assert.ok(typeof optRp.sharpe === 'number');
});

test('resolveAssetKey mappings and fallback', () => {
  assert.equal(resolveAssetKey('ppf'), 'PPF');
  assert.equal(resolveAssetKey('fd'), 'FD');
  assert.equal(resolveAssetKey('debt_mf'), 'Debt_MF');
  assert.equal(resolveAssetKey('rbi_bonds'), 'RBI_Bond');
  assert.equal(resolveAssetKey('g-sec'), 'G-Sec');
  assert.equal(resolveAssetKey('balancedadvantage'), 'Hybrid_MF');
  assert.equal(resolveAssetKey('gold_physical'), 'Gold');
  assert.equal(resolveAssetKey('unknown_custom_key'), 'unknown_custom_key');
});

test('computeRebalance returns deterministic drift directives and handles zero value', () => {
  // Zero/empty value handling
  const zeroResult = computeRebalance({}, {});
  assert.equal(zeroResult.total_portfolio_value, 0);
  assert.equal(zeroResult.rebalance_recommended, false);
  assert.equal(zeroResult.assets.length, 0);

  // Normal rebalance calculation
  const result = computeRebalance(
    { Equity_MF: 80_000, Debt_MF: 20_000 },
    { Equity_MF: 50_000, Debt_MF: 50_000 },
    2,
    1,
    24
  );

  assert.equal(result.total_portfolio_value, 100_000);
  assert.ok(result.drift_index > 0);
  assert.ok(result.assets.some(asset => asset.action_type === 'sell'));
  assert.ok(result.assets.some(asset => asset.action_type === 'buy'));
  assert.ok(typeof result.portfolio_tracking_error === 'number');
});

test('computeRebalance transaction cost rules and drift severities', () => {
  // High drift (> 12) scenario with holdingMonths < 12 (exit loads apply)
  const highDrift = computeRebalance(
    { Equity_MF: 90_000, Debt_MF: 10_000, Arbitrage_MF: 5000, Liquid_MF: 5000 },
    { Equity_MF: 10_000, Debt_MF: 90_000 },
    2.0,
    1.0,
    6 // < 12 months holding (exit loads for Equity_MF and Debt_MF apply)
  );

  assert.equal(highDrift.drift_severity, 'High');
  assert.equal(highDrift.rebalance_recommended, true);
  assert.ok(highDrift.total_estimated_transaction_cost > 0);

  // Check specific asset action types and holding exit loads
  const equityAsset = highDrift.assets.find(a => a.asset_class === 'Equity_MF');
  assert.equal(equityAsset.action_type, 'sell');
  assert.ok(equityAsset.estimated_transaction_cost > 0);

  // Gold transaction costs (resolved key 'Gold')
  const goldRebalance = computeRebalance(
    { Gold: 20_000, Debt_MF: 80_000 },
    { Gold: 80_000, Debt_MF: 20_000 },
    2.0,
    1.0,
    24
  );
  const goldAsset = goldRebalance.assets.find(a => a.asset_class === 'Gold');
  assert.equal(goldAsset.action_type, 'buy');
  assert.ok(goldAsset.transaction_cost_rate > 0);
});

