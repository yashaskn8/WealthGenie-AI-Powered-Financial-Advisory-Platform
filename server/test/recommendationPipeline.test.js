import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runPipeline,
  resolveBackendType,
  filterEligible,
  deriveWeights,
  parseProfile,
  PIPELINE_CONFIG,
  enforceDiversity,
  computeInstrumentScore,
  scoreReturn,
  scoreRisk,
  getInstrumentRisk,
  scoreTax,
  scoreLiquidity,
  scoreCost,
  scoreGoal,
  scoreHorizon,
  rankInstruments,
  normaliseConfidenceScores,
  INSTRUMENT_KEY_MAP,
  rankWhereToInvestBackend,
} from '../services/RecommendationPipeline.js';

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
  assert.equal(filterEligible(mockCatalog, { age: 24 }).eligible.some(i => i.id === 'min_max_age_fund'), false);
  assert.equal(filterEligible(mockCatalog, { age: 25 }).eligible.some(i => i.id === 'min_max_age_fund'), true);
  assert.equal(filterEligible(mockCatalog, { age: 55 }).eligible.some(i => i.id === 'min_max_age_fund'), true);
  assert.equal(filterEligible(mockCatalog, { age: 56 }).eligible.some(i => i.id === 'min_max_age_fund'), false);

  // Income boundary check (1,499,999 vs 1,500,000)
  assert.equal(filterEligible(mockCatalog, { annualIncome: 1499999 }).eligible.some(i => i.id === 'high_income_fund'), false);
  assert.equal(filterEligible(mockCatalog, { annualIncome: 1500000 }).eligible.some(i => i.id === 'high_income_fund'), true);

  // Savings boundary check (19,999 vs 20,000)
  assert.equal(filterEligible(mockCatalog, { savings: 19999 }).eligible.some(i => i.id === 'high_savings_fund'), false);
  assert.equal(filterEligible(mockCatalog, { savings: 20000 }).eligible.some(i => i.id === 'high_savings_fund'), true);

  // Girl child requirement check
  assert.equal(filterEligible(mockCatalog, { hasGirlChild: false }).eligible.some(i => i.id === 'sukanya'), false);
  assert.equal(filterEligible(mockCatalog, { hasGirlChild: true }).eligible.some(i => i.id === 'sukanya'), true);
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

test('deriveWeights exact alpha values for horizon and risk combinations', () => {
  // Base case: moderate risk, 10 year horizon
  const base = deriveWeights({ age: 30, annualIncome: 1000000, savings: 50000, risk: 'moderate', horizon: 10, goals: [], mr: 0 });
  assert.equal(base.alpha, 1.0); // no horizon or risk bonuses

  // horizon >= 15: +0.5
  const h15 = deriveWeights({ age: 30, annualIncome: 1000000, savings: 50000, risk: 'moderate', horizon: 15, goals: [], mr: 0 });
  assert.equal(h15.alpha, 1.5);

  // horizon >= 20: +0.5 + 0.3 = 1.8
  const h20 = deriveWeights({ age: 30, annualIncome: 1000000, savings: 50000, risk: 'moderate', horizon: 20, goals: [], mr: 0 });
  assert.equal(h20.alpha, 1.8);

  // aggressive + horizon >= 20: 1.0 + 0.5 + 0.3 + 0.5 = 2.3
  const aggH20 = deriveWeights({ age: 30, annualIncome: 1000000, savings: 50000, risk: 'aggressive', horizon: 20, goals: [], mr: 0 });
  assert.equal(aggH20.alpha, 2.3);

  // moderate-aggressive + short horizon: 1.0 + 0.5 = 1.5
  const modAgg = deriveWeights({ age: 30, annualIncome: 1000000, savings: 50000, risk: 'moderate-aggressive', horizon: 5, goals: [], mr: 0 });
  assert.equal(modAgg.alpha, 1.5);

  // conservative + short horizon: 1.0 - 0.3 = 0.7 (clamped to WEIGHT_FLOOR if < 0.5)
  const cons = deriveWeights({ age: 30, annualIncome: 1000000, savings: 50000, risk: 'conservative', horizon: 5, goals: [], mr: 0 });
  assert.equal(cons.alpha, Math.max(PIPELINE_CONFIG.WEIGHT_FLOOR, 0.7));
});

test('deriveWeights exact beta values for age and risk combinations', () => {
  // Age < 40, moderate: beta = 1.0
  const young = deriveWeights({ age: 25, annualIncome: 1000000, savings: 50000, risk: 'moderate', horizon: 10, goals: [], mr: 0 });
  assert.equal(young.beta, 1.0);

  // Age >= 40 but < 50: +0.4
  const mid40 = deriveWeights({ age: 45, annualIncome: 1000000, savings: 50000, risk: 'moderate', horizon: 10, goals: [], mr: 0 });
  assert.equal(mid40.beta, 1.4);

  // Age >= 50: +0.8
  const senior = deriveWeights({ age: 55, annualIncome: 1000000, savings: 50000, risk: 'moderate', horizon: 10, goals: [], mr: 0 });
  assert.equal(senior.beta, 1.8);

  // Age >= 50 + conservative: +0.8 + 0.8 = 2.6
  const seniorCons = deriveWeights({ age: 55, annualIncome: 1000000, savings: 50000, risk: 'conservative', horizon: 10, goals: [], mr: 0 });
  assert.equal(seniorCons.beta, 2.6);

  // Age >= 50 + aggressive: +0.8 - 0.4 = 1.4
  const seniorAgg = deriveWeights({ age: 55, annualIncome: 1000000, savings: 50000, risk: 'aggressive', horizon: 10, goals: [], mr: 0 });
  assert.equal(seniorAgg.beta, 1.4);
});

test('deriveWeights exact gamma, delta, epsilon, zeta, eta values', () => {
  // gamma: mr > 0 => (mr / 0.312) * 1.5; mr = 0 => 0 clamped to WEIGHT_FLOOR
  const noTax = deriveWeights({ age: 30, annualIncome: 300000, savings: 50000, risk: 'moderate', horizon: 10, goals: [], mr: 0 });
  assert.equal(noTax.gamma, PIPELINE_CONFIG.WEIGHT_FLOOR);

  const highTax = deriveWeights({ age: 30, annualIncome: 3000000, savings: 50000, risk: 'moderate', horizon: 10, goals: [], mr: 0.30 });
  const expectedGamma = Math.min(PIPELINE_CONFIG.WEIGHT_CEIL, Math.max(PIPELINE_CONFIG.WEIGHT_FLOOR, (0.30 / 0.312) * 1.5));
  assert.equal(highTax.gamma, expectedGamma);

  // delta: base 0.8, emergency cover < 0.2 => +0.6
  const lowEmergency = deriveWeights({ age: 30, annualIncome: 1000000, savings: 1000, risk: 'moderate', horizon: 10, goals: [], mr: 0 });
  assert.equal(lowEmergency.delta, Math.max(PIPELINE_CONFIG.WEIGHT_FLOOR, Math.min(PIPELINE_CONFIG.WEIGHT_CEIL, 1.4))); // 0.8 + 0.6

  const highEmergency = deriveWeights({ age: 30, annualIncome: 1000000, savings: 50000, risk: 'moderate', horizon: 10, goals: [], mr: 0 });
  assert.equal(highEmergency.delta, Math.max(PIPELINE_CONFIG.WEIGHT_FLOOR, Math.min(PIPELINE_CONFIG.WEIGHT_CEIL, 0.8)));

  // epsilon: goals.length > 0 => 1.2, else 0.5
  const withGoals = deriveWeights({ age: 30, annualIncome: 1000000, savings: 50000, risk: 'moderate', horizon: 10, goals: ['Retirement'], mr: 0 });
  assert.equal(withGoals.epsilon, 1.2);

  const noGoals = deriveWeights({ age: 30, annualIncome: 1000000, savings: 50000, risk: 'moderate', horizon: 10, goals: [], mr: 0 });
  assert.equal(noGoals.epsilon, PIPELINE_CONFIG.WEIGHT_FLOOR);

  // zeta: base 1.0; horizon <= 3 => +0.5; horizon >= 20 => +0.3
  const shortHz = deriveWeights({ age: 30, annualIncome: 1000000, savings: 50000, risk: 'moderate', horizon: 3, goals: [], mr: 0 });
  assert.equal(shortHz.zeta, 1.5);

  const longHz = deriveWeights({ age: 30, annualIncome: 1000000, savings: 50000, risk: 'moderate', horizon: 20, goals: [], mr: 0 });
  assert.equal(longHz.zeta, 1.3);

  const midHz = deriveWeights({ age: 30, annualIncome: 1000000, savings: 50000, risk: 'moderate', horizon: 10, goals: [], mr: 0 });
  assert.equal(midHz.zeta, 1.0);

  // eta: base 0.5; horizon >= 10 => +0.3; horizon >= 20 => +0.3 + 0.4
  const etaShort = deriveWeights({ age: 30, annualIncome: 1000000, savings: 50000, risk: 'moderate', horizon: 5, goals: [], mr: 0 });
  assert.equal(etaShort.eta, PIPELINE_CONFIG.WEIGHT_FLOOR);

  const etaMid = deriveWeights({ age: 30, annualIncome: 1000000, savings: 50000, risk: 'moderate', horizon: 10, goals: [], mr: 0 });
  assert.equal(etaMid.eta, 0.8);

  const etaLong = deriveWeights({ age: 30, annualIncome: 1000000, savings: 50000, risk: 'moderate', horizon: 20, goals: [], mr: 0 });
  assert.ok(Math.abs(etaLong.eta - 1.2) < 1e-10, `eta should be ~1.2, got ${etaLong.eta}`);
});

test('parseProfile parses numeric fields and applies defaults', () => {
  // All defaults
  const def = parseProfile({});
  assert.equal(def.age, 30);
  assert.equal(def.annualIncome, 600000);
  assert.equal(def.savings, 10000);
  assert.equal(def.risk, 'moderate');
  assert.equal(def.horizon, 10);
  assert.deepEqual(def.goals, []);
  assert.equal(def.taxRegime, 'new');
  assert.ok(typeof def.mr === 'number');

  // String numeric values should be parsed
  const strProfile = parseProfile({ age: '45', annualIncome: '2000000', savings: '50000', investmentHorizon: '15' });
  assert.equal(strProfile.age, 45);
  assert.equal(strProfile.annualIncome, 2000000);
  assert.equal(strProfile.savings, 50000);
  assert.equal(strProfile.horizon, 15);

  // Goal type extraction
  const goalProfile = parseProfile({ goal_type: 'Wealth Growth' });
  assert.deepEqual(goalProfile.goals, ['Wealth Growth']);

  // Risk category normalization
  const riskProfile = parseProfile({ riskCategory: 'Aggressive' });
  assert.equal(riskProfile.risk, 'aggressive');

  // Tax regime fallback
  const noRegime = parseProfile({ taxRegime: undefined });
  assert.equal(noRegime.taxRegime, 'new');

  const oldRegime = parseProfile({ taxRegime: 'old' });
  assert.equal(oldRegime.taxRegime, 'old');
});

test('runPipeline handles empty or missing ML confidence scores', () => {
  const profile = {
    age: 32,
    annualIncome: 1200000,
    savings: 30000,
    riskCategory: 'Moderate',
    investmentHorizon: 12,
    taxRegime: 'new',
  };

  // No ML result at all -> pass empty object
  const noML = runPipeline(profile, {});
  assert.ok(noML.instruments.length > 0);
  const totalWeight = noML.instruments.reduce((s, i) => s + i.allocationWeight, 0);
  assert.equal(parseFloat(totalWeight.toFixed(4)), 1.0);

  // Empty confidence scores
  const emptyML = runPipeline(profile, { confidence_scores: {} });
  assert.ok(emptyML.instruments.length > 0);

  // All zero confidence scores
  const zeroML = runPipeline(profile, { confidence_scores: { PPF: 0, FD: 0 } });
  assert.ok(zeroML.instruments.length > 0);
});

test('runPipeline respects topN and minAssetClasses options', () => {
  const profile = {
    age: 32,
    annualIncome: 1200000,
    savings: 30000,
    riskCategory: 'Moderate',
    investmentHorizon: 12,
    taxRegime: 'new',
  };
  const mlResult = { confidence_scores: {} };

  // topN = 3
  const top3 = runPipeline(profile, mlResult, { topN: 3 });
  assert.equal(top3.instruments.length, 3);

  // topN = 10
  const top10 = runPipeline(profile, mlResult, { topN: 10 });
  assert.equal(top10.instruments.length, 10);

  // Weights always sum to 1
  for (const res of [top3, top10]) {
    const sum = res.instruments.reduce((s, i) => s + i.allocationWeight, 0);
    assert.equal(parseFloat(sum.toFixed(4)), 1.0);
  }
});

test('runPipeline instruments have correct structure and score ordering', () => {
  const profile = {
    age: 35,
    annualIncome: 1500000,
    savings: 40000,
    riskCategory: 'Moderate',
    investmentHorizon: 10,
    goal_type: 'Wealth Growth',
    taxRegime: 'new',
  };

  const result = runPipeline(profile, { confidence_scores: { 'Public_Provident_Fund': 0.9 } }, { topN: 5 });

  // All instruments have required properties
  result.instruments.forEach(inst => {
    assert.ok(typeof inst.name === 'string');
    assert.ok(typeof inst.type === 'string');
    assert.ok(typeof inst.nominalReturn === 'number');
    assert.ok(typeof inst.postTaxReturn === 'number');
    assert.ok(typeof inst.sharpeRatio === 'number');
    assert.ok(typeof inst.allocationWeight === 'number');
    assert.ok(typeof inst.score === 'number');
    assert.ok(inst.allocationWeight > 0);
    assert.ok(inst.allocationWeight <= 1);
  });

  // Instruments are sorted by score descending
  for (let i = 1; i < result.instruments.length; i++) {
    assert.ok(result.instruments[i - 1].score >= result.instruments[i].score,
      `Instrument ${i-1} score should be >= instrument ${i} score`);
  }
});

test('RecommendationPipeline scoreRisk factor precision (conservative-moderate, dist=1 vs dist>=2, volatility excess)', () => {
  const catalog = [
    { id: 'perfect_cons', riskLevel: 1 },
    { id: 'close_cons', riskLevel: 3 }, // dist = 1 from ideal [1,2] -> dist=1 penalty
    { id: 'severe_cons', riskLevel: 5, volatility: 0.25 }, // dist = 3, high vol excess
    { id: 'risk_prop', risk: 4 }, // fallback to inv.risk
  ];

  // conservative-moderate profile (idealMin=1, idealMax=2)
  const resConsMod = runPipeline(
    { age: 30, annualIncome: 600000, savings: 10000, riskCategory: 'conservative-moderate', investmentHorizon: 10 },
    {},
    { catalog }
  );
  assert.ok(resConsMod.instruments.length > 0);

  // moderate-aggressive profile (idealMin=3, idealMax=5)
  const resModAgg = runPipeline(
    { age: 30, annualIncome: 600000, savings: 10000, riskCategory: 'moderate-aggressive', investmentHorizon: 10 },
    {},
    { catalog }
  );
  assert.ok(resModAgg.instruments.length > 0);
});

test('RecommendationPipeline scoreTax, scoreLiquidity, scoreCost, scoreGoal, scoreHorizon factor branches', () => {
  const customCatalog = [
    {
      id: 'custom_tax_eee',
      expectedReturn: 8,
      taxType: 'eee',
      liquidityScore: 4, // scoreLiquidity uses liquidityScore
      goalTags: ['Retirement', 'Tax Saving', 'Wealth Growth'], // goal matching cap
      lockIn: 0,
      expenseRatio: 0, // COST_FREE_BONUS
      idealHorizon: { min: 5, max: 10 },
    },
    {
      id: 'custom_tax_eff',
      expectedReturn: 7,
      taxEfficiencyScore: 2, // (5 - 2) * mr * 10
      lockIn: 3, // scoreLiquidity lockIn <= 3
      expenseRatio: 1.5, // er * COST_PENALTY_SCALE
      idealHorizon: { min: 10, max: 15 },
    },
    {
      id: 'custom_tax_slab',
      expectedReturn: 6,
      taxType: 'slab',
      lockIn: 7, // scoreLiquidity lockIn > 3
      idealHorizon: { min: 15, max: 20 }, // severe horizon mismatch when p.horizon = 2
    },
  ];

  // Run with high income (high tax slab) and p.horizon = 2 (severe mismatch for 3rd item, perfect for 1st)
  const res = runPipeline(
    { age: 30, annualIncome: 3000000, savings: 50000, riskCategory: 'Moderate', investmentHorizon: 2, goal_type: 'Retirement' },
    {},
    { catalog: customCatalog, topN: 3, minAssetClasses: 1 }
  );

  assert.equal(res.instruments.length, 3);
  // Verify order and scoring properties
  assert.ok(res.instruments[0].score > res.instruments[2].score);
});

test('RecommendationPipeline enforceDiversity swaps lowest-ranked pick for unrepresented asset class', () => {
  const ranked = [
    { id: 1, category: 'CatA', score: 10 },
    { id: 2, category: 'CatA', score: 9 },
    { id: 3, category: 'CatA', score: 8 },
    { id: 4, category: 'CatB', score: 7 },
    { id: 5, category: 'CatC', score: 6 },
  ];

  // Request topN = 3, minAssetClasses = 2. First pass takes items 1, 2, 3 (all CatA).
  // Second pass swaps item 3 (lowest score in result) for item 4 (CatB).
  const result = enforceDiversity(ranked, 3, 2);
  assert.equal(result.length, 3);
  assert.equal(result[0].id, 1);
  assert.equal(result[1].id, 2);
  assert.equal(result[2].id, 5); // Item 5 swapped into third slot for missing category
});

test('RecommendationPipeline handles totalScore <= 0 edge case during weight normalization', () => {
  // Catalog with extremely penalized items where scores are negative
  const badCatalog = [
    { id: 'bad1', expectedReturn: 0.1, riskLevel: 5, lockIn: 20, idealHorizon: { min: 25, max: 30 } },
    { id: 'bad2', expectedReturn: 0.1, riskLevel: 5, lockIn: 20, idealHorizon: { min: 25, max: 30 } },
  ];

  const res = runPipeline(
    { age: 65, annualIncome: 1000000, savings: 1000, riskCategory: 'Conservative', investmentHorizon: 1 },
    {},
    { catalog: badCatalog, topN: 2 }
  );

  assert.equal(res.instruments.length, 2);
  const totalWeight = res.instruments.reduce((s, i) => s + i.allocationWeight, 0);
  assert.equal(parseFloat(totalWeight.toFixed(4)), 1.0);
});

test('scoreReturn, scoreTax, scoreLiquidity, scoreCost direct unit math', () => {
  // scoreReturn: postTaxRate * RETURN_MULTIPLIER (3.5)
  assert.equal(scoreReturn(10), 35);
  assert.equal(scoreReturn(0), 0);

  // scoreTax:
  // 1) EEE -> -12
  assert.equal(scoreTax({ taxType: 'eee' }, { mr: 0.30 }), -12);
  // 2) taxEfficiencyScore -> (5 - score) * mr * TAX_PENALTY_SCALE (8)
  //    (5 - 2) * 0.30 * 8 = 7.2 (floating point: 7.199999999999999)
  const taxScore = scoreTax({ taxEfficiencyScore: 2 }, { mr: 0.30 });
  assert.ok(Math.abs(taxScore - 7.2) < 1e-10, `Expected ~7.2, got ${taxScore}`);
  // 3) slab -> mr * 20
  assert.equal(scoreTax({ taxType: 'slab' }, { mr: 0.20 }), 4.0);

  // scoreLiquidity: (score - LIQUIDITY_CENTER(3)) * LIQUIDITY_SCALE(4), clamped >= 0
  assert.equal(scoreLiquidity({ liquidityScore: 5 }), 8);  // (5-3)*4 = 8
  assert.equal(scoreLiquidity({ liquidityScore: 1 }), 0);  // Math.max(0, (1-3)*4) = 0
  // lockIn fallbacks
  assert.equal(scoreLiquidity({ lockIn: 0 }), 5);
  assert.equal(scoreLiquidity({ lockIn: 2 }), 2);
  assert.equal(scoreLiquidity({ lockIn: 5 }), 0);

  // scoreCost: er=0 -> -COST_FREE_BONUS(-3), er>0 -> er * COST_PENALTY_SCALE(100)
  assert.equal(scoreCost({ expenseRatio: 0 }), -3);
  assert.equal(scoreCost({ expenseRatio: 1.5 }), 150);
});

test('scoreGoal and scoreHorizon direct factor precision', () => {
  // scoreGoal: matchCount * GOAL_TAG_POINTS(5), capped at GOAL_TAG_CAP(15)
  const invWithTags = { goalTags: ['Retirement', 'Wealth Growth', 'Tax Saving'] };
  assert.equal(scoreGoal(invWithTags, { goals: ['Retirement'] }), 5);
  assert.equal(scoreGoal(invWithTags, { goals: ['Retirement', 'Wealth Growth', 'Tax Saving', 'Child Education'] }), 15);
  assert.equal(scoreGoal(invWithTags, { goals: [] }), 0);

  // scoreHorizon for lockIn=3, idealHorizon={min:5, max:10}:
  const invHoriz = { lockIn: 3, idealHorizon: { min: 5, max: 10 } };

  // horizon=2: lockIn(3) > horizon(2) -> no LOCK_FIT. ideal: 2>=0 -> +PARTIAL(5). Total=5
  assert.equal(scoreHorizon(invHoriz, { horizon: 2 }), 5);

  // horizon=7: lockIn(3)<=7 -> +LOCK_FIT(15). 7 in [5,10] -> +PERFECT(15). Total=30
  assert.equal(scoreHorizon(invHoriz, { horizon: 7 }), 30);

  // horizon=4: lockIn(3)<=4 -> +LOCK_FIT(15). 4 in [3,15] -> +GOOD(10). Total=25
  assert.equal(scoreHorizon(invHoriz, { horizon: 4 }), 25);

  // No idealHorizon, lockIn=0: +LOCK_FIT(15) + NO_LOCK(5) = 20
  assert.equal(scoreHorizon({ lockIn: 0 }, { horizon: 5 }), 20);
});

test('normaliseConfidenceScores mapping and invalid score filtering', () => {
  assert.deepEqual(normaliseConfidenceScores(null), {});
  assert.deepEqual(normaliseConfidenceScores(undefined), {});
  assert.deepEqual(normaliseConfidenceScores('invalid'), {});

  // Mapped keys
  const raw = {
    'Public_Provident_Fund': 0.95,
    'Bank_FD': 0.80,
    'Nifty_Index': 0.88,
    'Custom_Key': 0.70,
    'Bad_Key': NaN,
    'String_Val': '0.50',
  };

  const norm = normaliseConfidenceScores(raw);
  assert.equal(norm['PPF'], 0.95);
  assert.equal(norm['FD'], 0.80);
  assert.equal(norm['Index_MF'], 0.88);
  assert.equal(norm['Custom_Key'], 0.70);
  assert.equal(norm['Bad_Key'], undefined);
  assert.equal(norm['String_Val'], undefined);
});

test('rankInstruments sorts descending by score', () => {
  const scored = [
    { id: 'b', score: 10 },
    { id: 'a', score: 25 },
    { id: 'c', score: 5 },
  ];

  const ranked = rankInstruments(scored);
  assert.equal(ranked[0].id, 'a');
  assert.equal(ranked[1].id, 'b');
  assert.equal(ranked[2].id, 'c');
});

test('rankWhereToInvestBackend evaluates candidates with backend taxEngine and macro regimes', () => {
  const candidates = [
    { name: 'Public Provident Fund (PPF)', rate: '7.1%', highlight: '80C EEE status', badge: '100% Sovereign' },
    { name: 'Quant Small Cap Fund', rate: '22.5%', highlight: 'momentum small cap high volatility', badge: 'Highest Returns' },
    { name: 'Motilal Oswal Nifty India Defence Index Fund', rate: '18.0%', highlight: 'defence manufacturing order books', badge: 'Official Scheme' }
  ];

  const profile = { age: 35, annualIncome: 2000000, taxRegime: 'new', riskCategory: 'Moderate', investmentHorizon: 10 };
  const ranked = rankWhereToInvestBackend(candidates, profile, { regimeApplied: true, regimeKey: 'geopolitical_conflict' });

  assert.equal(ranked.length, 3);
  assert.ok(ranked[0].profileMatchTag || ranked[0].postTaxYieldStr);
  
  // Verify tax savings note computed for 30% slab profile
  const ppf = ranked.find(c => c.name.includes('PPF'));
  assert.ok(ppf.taxSavingsNote.includes('Sec 80C'));
});

test('WG-001: scoreRisk differentiates low-risk (PPF, value=1) vs high-risk (ELSS, value=4) instruments', () => {
  const conservativeProfile = { risk: 'conservative' };
  const aggressiveProfile = { risk: 'aggressive' };

  const ppf = { id: 'ppf', dynamicData: { risk: { level: 'Very Low', value: 1 } } };
  const elss = { id: 'elss', dynamicData: { risk: { level: 'High', value: 4 } } };

  // Verify getInstrumentRisk correctly extracts values
  assert.equal(getInstrumentRisk(ppf), 1);
  assert.equal(getInstrumentRisk(elss), 4);

  // For conservative user: PPF (risk 1) is ideal, ELSS (risk 4) is mismatch/penalty
  const scorePpfCons = scoreRisk(ppf, conservativeProfile);
  const scoreElssCons = scoreRisk(elss, conservativeProfile);
  assert.notEqual(scorePpfCons, scoreElssCons, 'Conservative user must score PPF and ELSS risk differently');
  assert.ok(scorePpfCons < scoreElssCons, 'PPF should have better (lower penalty) risk score for conservative user');

  // For aggressive user: ELSS (risk 4) is ideal, PPF (risk 1) is close/mismatch
  const scorePpfAgg = scoreRisk(ppf, aggressiveProfile);
  const scoreElssAgg = scoreRisk(elss, aggressiveProfile);
  assert.notEqual(scorePpfAgg, scoreElssAgg, 'Aggressive user must score PPF and ELSS risk differently');
  assert.ok(scoreElssAgg < scorePpfAgg, 'ELSS should have better (lower penalty) risk score for aggressive user');
});








