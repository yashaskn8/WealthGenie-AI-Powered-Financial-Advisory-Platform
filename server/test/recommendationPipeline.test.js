import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { runPipeline, resolveBackendType, filterEligible, deriveWeights, parseProfile, PIPELINE_CONFIG } from '../services/RecommendationPipeline.js';

test('RecommendationPipeline resolveBackendType mapping precision', () => {
  assert.equal(resolveBackendType({ id: 'ppf' }), 'PPF');
  assert.equal(resolveBackendType({ id: 'scss' }), 'SCSS');
  assert.equal(resolveBackendType({ id: 'sukanya' }), 'SSY');
  assert.equal(resolveBackendType({ id: 'rbi_bonds' }), 'RBI_Bond');
  assert.equal(resolveBackendType({ id: 'sgb' }), 'SGB');
  assert.equal(resolveBackendType({ id: 'nps' }), 'NPS');
  assert.equal(resolveBackendType({ id: 'fd' }), 'FD');
  assert.equal(resolveBackendType({ id: 'liquid_mf' }), 'Liquid_MF');
  assert.equal(resolveBackendType({ id: 'debt_mf' }), 'Debt_MF');
  assert.equal(resolveBackendType({ id: 'hybrid_mf' }), 'Hybrid_MF');
  assert.equal(resolveBackendType({ id: 'index_mf' }), 'Index_MF');
  assert.equal(resolveBackendType({ id: 'elss' }), 'ELSS');
  assert.equal(resolveBackendType({ id: 'equity_mf' }), 'Equity_MF');
  assert.equal(resolveBackendType({ id: 'etf' }), 'ETF');
  assert.equal(resolveBackendType({ id: 'gold_etf' }), 'Gold');
  assert.equal(resolveBackendType({ id: 'nifty_etf' }), 'ETF');
  assert.equal(resolveBackendType({ id: 'midcap_mf' }), 'Midcap_MF');
  assert.equal(resolveBackendType({ id: 'smallcap_mf' }), 'Smallcap_MF');
  assert.equal(resolveBackendType({ id: 'arbitrage_mf' }), 'Arbitrage_MF');
  assert.equal(resolveBackendType({ id: 'direct_equity' }), 'Equity_MF');

  // Substring matching priorities
  assert.equal(resolveBackendType({ id: 'my_fixed_deposit_1' }), 'FD');
  assert.equal(resolveBackendType({ id: 'my_elss_tax_saver' }), 'ELSS');
  assert.equal(resolveBackendType({ id: 'liquid_cash_fund' }), 'Liquid_MF');
  assert.equal(resolveBackendType({ id: 'corporate_bond_fund' }), 'Debt_MF');
  assert.equal(resolveBackendType({ id: 'short_duration_debt' }), 'Debt_MF');
  assert.equal(resolveBackendType({ id: 'balanced_advantage_fund' }), 'Hybrid_MF');
  assert.equal(resolveBackendType({ id: 'nifty_index_fund' }), 'Index_MF');
  assert.equal(resolveBackendType({ id: 'midcap_growth_fund' }), 'Midcap_MF');
  assert.equal(resolveBackendType({ id: 'smallcap_opportunity' }), 'Smallcap_MF');
  assert.equal(resolveBackendType({ id: 'gold_savings_fund' }), 'Gold');
  assert.equal(resolveBackendType({ id: 'arbitrage_plus' }), 'Arbitrage_MF');
  assert.equal(resolveBackendType({ id: 'nifty50_etf_token' }), 'ETF');
  assert.equal(resolveBackendType({ id: 'flexicap_equity_fund' }), 'Equity_MF');
  assert.equal(resolveBackendType({ id: 'bluechip_largecap' }), 'Equity_MF');

  // Category fallbacks
  assert.equal(resolveBackendType({ id: 'unknown_x', category: 'Government' }), 'RBI_Bond');
  assert.equal(resolveBackendType({ id: 'unknown_x', category: 'Gold' }), 'Gold');
  assert.equal(resolveBackendType({ id: 'unknown_x', category: 'Retirement' }), 'NPS');
  assert.equal(resolveBackendType({ id: 'unknown_x', category: 'Bank Deposits' }), 'FD');
  assert.equal(resolveBackendType({ id: 'unknown_x', category: 'Debt Mutual Funds' }), 'Debt_MF');
  assert.equal(resolveBackendType({ id: 'unknown_x', category: 'Equity Mutual Funds' }), 'Equity_MF');
  assert.equal(resolveBackendType({ id: 'unknown_x', category: 'ETFs' }), 'ETF');
  assert.equal(resolveBackendType({ id: 'unknown_x', category: 'REITs & InvITs' }), 'ETF');
  assert.equal(resolveBackendType({ id: 'unknown_x', category: 'Bonds & Debentures' }), 'Debt_MF');
  assert.equal(resolveBackendType({ id: 'unknown_x', category: 'Insurance-linked' }), 'Debt_MF');
  assert.equal(resolveBackendType({ id: 'unknown_x', category: 'Direct Equity' }), 'Equity_MF');

  // Safe default fallback
  assert.equal(resolveBackendType({ id: 'completely_unknown_999' }), 'Debt_MF');
});

test('RecommendationPipeline filterEligible gates by age, income, savings and girl child', () => {
  const mockCatalog = [
    { id: 'min_max_age_fund', eligibility: { minAge: 25, maxAge: 55 } },
    { id: 'sukanya', eligibility: { hasGirlChild: true } },
    { id: 'high_savings_fund', eligibility: { minMonthlySavings: 20000 } },
    { id: 'high_income_fund', eligibility: { minAnnualIncome: 1500000 } },
    { id: 'universal_fund' },
  ];

  // Age boundary check (exact age 24 vs 25 vs 55 vs 56)
  assert.equal(filterEligible(mockCatalog, { age: 24 }).some(i => i.id === 'min_max_age_fund'), false);
  assert.equal(filterEligible(mockCatalog, { age: 25 }).some(i => i.id === 'min_max_age_fund'), true);
  assert.equal(filterEligible(mockCatalog, { age: 55 }).some(i => i.id === 'min_max_age_fund'), true);
  assert.equal(filterEligible(mockCatalog, { age: 56 }).some(i => i.id === 'min_max_age_fund'), false);

  // Income boundary check (1,499,999 vs 1,500,000)
  assert.equal(filterEligible(mockCatalog, { annualIncome: 1499999 }).some(i => i.id === 'high_income_fund'), false);
  assert.equal(filterEligible(mockCatalog, { annualIncome: 1500000 }).some(i => i.id === 'high_income_fund'), true);

  // Savings boundary check (19,999 vs 20,000)
  assert.equal(filterEligible(mockCatalog, { savings: 19999 }).some(i => i.id === 'high_savings_fund'), false);
  assert.equal(filterEligible(mockCatalog, { savings: 20000 }).some(i => i.id === 'high_savings_fund'), true);

  // Girl child requirement check
  assert.equal(filterEligible(mockCatalog, { hasGirlChild: false }).some(i => i.id === 'sukanya'), false);
  assert.equal(filterEligible(mockCatalog, { hasGirlChild: true }).some(i => i.id === 'sukanya'), true);
});

test('RecommendationPipeline parseProfile and deriveWeights boundaries', () => {
  // Parsed defaults
  const parsedDefault = parseProfile({});
  assert.equal(parsedDefault.age, 30);
  assert.equal(parsedDefault.annualIncome, 600000);
  assert.equal(parsedDefault.savings, 10000);
  assert.equal(parsedDefault.risk, 'moderate');
  assert.equal(parsedDefault.horizon, 10);
  assert.deepEqual(parsedDefault.goals, []);

  // Weight derivation boundaries
  // 1) Young, short horizon, conservative, high emergency savings
  const w1 = deriveWeights({
    age: 25, annualIncome: 1000000, savings: 50000, risk: 'conservative', horizon: 2, goals: [], mr: 0,
  });
  assert.ok(w1.alpha >= PIPELINE_CONFIG.WEIGHT_FLOOR);
  assert.ok(w1.beta > 1.0); // conservative age/risk boost
  assert.equal(w1.gamma, PIPELINE_CONFIG.WEIGHT_FLOOR); // mr = 0 => gamma = 0, clamped to WEIGHT_FLOOR (0.5)

  // 2) Senior, aggressive, long horizon, low emergency savings, high tax slab
  const w2 = deriveWeights({
    age: 55, annualIncome: 3000000, savings: 1000, risk: 'aggressive', horizon: 20, goals: ['Wealth Growth'], mr: 0.30,
  });
  assert.ok(w2.alpha > 1.0); // horizon >= 20 & aggressive boost
  assert.ok(w2.beta >= 1.0); // age 55 (+0.8) minus aggressive (-0.4)
  assert.ok(w2.gamma > 1.0); // mr = 0.30 => gamma = (0.3/0.312)*1.5
  assert.ok(w2.delta > 1.0); // emergency cover < 0.2
  assert.equal(w2.epsilon, 1.2); // goals.length > 0
});

test('RecommendationPipeline runPipeline options and weight normalization', () => {
  const profile = {
    age: 32,
    annualIncome: 1200000,
    savings: 30000,
    riskCategory: 'Moderate',
    investmentHorizon: 12,
    goal_type: 'Wealth Growth',
    taxRegime: 'new',
  };

  const mlResult = {
    confidence_scores: {
      'Public_Provident_Fund': 0.95, // Test INSTRUMENT_KEY_MAP translation
      'Bank_FD': 0.85,
      'National_Pension': 0.75,
      'RBI_Bond': 0.65,
      'Sovereign_Gold_Bond': 0.55,
      'Gold_ETF': 0.45,
      'Nifty_Index': 0.35,
      'Balanced_Advantage': 0.25,
      'Invalid_Non_Number': 'invalid',
    },
  };

  const result = runPipeline(profile, mlResult, { topN: 6, minAssetClasses: 4 });
  assert.equal(result.instruments.length, 6);

  // Confidence scores map correctly
  assert.equal(result.confidenceScores.PPF, 0.95);
  assert.equal(result.confidenceScores.FD, 0.85);
  assert.equal(result.confidenceScores.NPS, 0.75);
  assert.equal(result.confidenceScores.RBI_Bond, 0.65);
  assert.equal(result.confidenceScores.SGB, 0.55);
  assert.equal(result.confidenceScores.Gold, 0.45);
  assert.equal(result.confidenceScores.Index_MF, 0.35);
  assert.equal(result.confidenceScores.Hybrid_MF, 0.25);
  assert.equal(result.confidenceScores.Invalid_Non_Number, undefined);

  // Verify weights sum exactly to 1.0000
  const totalWeight = result.instruments.reduce((s, i) => s + i.allocationWeight, 0);
  assert.equal(parseFloat(totalWeight.toFixed(4)), 1.0);

  // Verify instrument properties present
  result.instruments.forEach(inst => {
    assert.ok(inst.name);
    assert.ok(inst.type);
    assert.ok(typeof inst.nominalReturn === 'number');
    assert.ok(typeof inst.postTaxReturn === 'number');
    assert.ok(typeof inst.sharpeRatio === 'number');
    assert.ok(typeof inst.allocationWeight === 'number');
    assert.ok(typeof inst.score === 'number');
  });
});

test('RecommendationPipeline dynamic age overrides (senior vs young)', () => {
  const seniorProfile = {
    age: 68,
    annualIncome: 800000,
    savings: 15000,
    riskCategory: 'Conservative',
    investmentHorizon: 5,
    goal_type: 'Retirement',
    taxRegime: 'new',
  };

  const mlResult = { confidence_scores: { 'Smallcap_MF': 0.8, 'FD': 0.1 } };
  const seniorResult = runPipeline(seniorProfile, mlResult);

  const topPicks = seniorResult.instruments.slice(0, 3).map(i => i.type);
  assert.ok(!topPicks.includes('Smallcap_MF') || seniorResult.instruments.find(i => i.type === 'Smallcap_MF').allocationWeight < 0.25);
  assert.ok(topPicks.includes('SCSS') || topPicks.includes('FD') || topPicks.includes('PPF') || topPicks.includes('RBI_Bond'));
});

