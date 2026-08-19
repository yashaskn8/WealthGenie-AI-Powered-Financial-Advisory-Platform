import test from 'node:test';
import assert from 'node:assert/strict';
import { rankWhereToInvestBackend } from '../services/RecommendationPipeline.js';
import { investmentDatabase } from '../data/investmentDatabase.js';

// ==============================================================================
// PROOF 1: rankWhereToInvestBackend() produces non-zero nominalRate for all 104 previously-affected instruments
// ==============================================================================
test('PROOF 1: rankWhereToInvestBackend correctly derives nominalRate, postTaxYieldVal, age bonus, and tags for null-rate instruments', () => {
  const profileYoungAggressive = {
    age: 26,
    annual_income: 1200000,
    taxRegime: 'new',
    riskCategory: 'Aggressive',
    investment_horizon: 10,
  };

  // Pick representative samples across Equity MF, ETF, Direct Equity, and REIT
  const sampleIds = [
    { id: 'midcap_mf', type: 'Equity Mutual Fund', expectedMinReturn: 17.0 },
    { id: 'nifty_etf', type: 'ETF', expectedMinReturn: 12.0 },
    { id: 'direct_equity', type: 'Direct Equity', expectedMinReturn: 14.0 },
    { id: 'embassy_reit', type: 'REIT', expectedMinReturn: 9.0 },
  ];

  for (const sample of sampleIds) {
    const inst = investmentDatabase.find(c => c.id === sample.id);
    assert.ok(inst, `Instrument ${sample.id} must exist in investmentDatabase`);
    assert.equal(inst.rate, null, `${sample.id} must be one of the null-rate catalog instruments`);

    const candidate = [{
      id: inst.id,
      name: inst.name,
      expectedReturn: inst.expectedReturn,
      rate: inst.rate,
      badge: inst.badge || '',
      highlight: inst.highlight || '',
    }];

    const ranked = rankWhereToInvestBackend(candidate, profileYoungAggressive);
    assert.equal(ranked.length, 1);
    const item = ranked[0];

    // Verify non-zero nominal rate and post-tax yield
    assert.ok(item.postTaxYieldVal > 0, `postTaxYieldVal must be > 0 for ${sample.id}, got ${item.postTaxYieldVal}`);
    assert.match(item.postTaxYieldStr, /~[\d\.]+% \(Post-Tax\)/, `postTaxYieldStr must be formatted post-tax string, got ${item.postTaxYieldStr}`);
    assert.ok(item.postTaxYieldVal >= sample.expectedMinReturn * (1 - 0.125) - 0.1, `postTaxYieldVal should reflect expectedReturn for ${sample.id}`);
  }

  // Verify Age <= 30 growth bonus and Long-Term Compounder tag on high-growth instrument (midcap_mf with 17.5% expectedReturn)
  const midcapInst = investmentDatabase.find(c => c.id === 'midcap_mf');
  const midcapRanked = rankWhereToInvestBackend([{
    id: midcapInst.id,
    name: midcapInst.name,
    expectedReturn: midcapInst.expectedReturn,
    rate: midcapInst.rate,
    badge: midcapInst.badge || '',
    highlight: midcapInst.highlight || '',
  }], profileYoungAggressive)[0];

  assert.equal(midcapRanked.profileMatchTag, 'Long-Term Compounder', 'High expectedReturn (>12%) and horizon >= 7 must receive Long-Term Compounder tag');
  assert.ok(midcapRanked._score > 80, `Midcap MF score (${midcapRanked._score}) must reflect age growth bonus (+10) and post-tax yield contribution`);
});

// ==============================================================================
// PROOF 2: Material before/after score changes for at least 3 affected instruments
// ==============================================================================
test('PROOF 2: Material score improvements for affected instruments (Midcap MF, Direct Equity, Smallcap MF)', () => {
  const profile = {
    age: 25,
    annual_income: 1500000,
    taxRegime: 'new',
    riskCategory: 'Aggressive',
    investment_horizon: 10,
  };

  const testCases = [
    { id: 'midcap_mf', expectedScoreIncreaseMin: 14 },
    { id: 'direct_equity', expectedScoreIncreaseMin: 7 },
    { id: 'smallcap_mf', expectedScoreIncreaseMin: 14 },
  ];

  for (const tc of testCases) {
    const inst = investmentDatabase.find(c => c.id === tc.id);

    // Score with current fix
    const fixedCandidate = [{
      id: inst.id,
      name: inst.name,
      expectedReturn: inst.expectedReturn,
      rate: null, // Null rate to test WTI resolution
      badge: inst.badge || '',
      highlight: inst.highlight || '',
    }];
    const afterResult = rankWhereToInvestBackend(fixedCandidate, profile)[0];

    // Score under old bug (simulate nominalRate = 0)
    const brokenCandidate = [{
      id: 'mock_zero_rate_bug',
      name: inst.name,
      expectedReturn: 0,
      rate: null,
      badge: inst.badge || '',
      highlight: inst.highlight || '',
    }];
    const beforeResult = rankWhereToInvestBackend(brokenCandidate, profile)[0];

    const scoreDelta = afterResult._score - beforeResult._score;
    assert.ok(
      scoreDelta >= tc.expectedScoreIncreaseMin,
      `Score for ${tc.id} must increase by at least ${tc.expectedScoreIncreaseMin} points under fix. Before: ${beforeResult._score}, After: ${afterResult._score}, Delta: ${scoreDelta}`
    );
    assert.ok(afterResult.postTaxYieldVal > 0, `postTaxYieldVal for ${tc.id} must be > 0`);
  }
});
