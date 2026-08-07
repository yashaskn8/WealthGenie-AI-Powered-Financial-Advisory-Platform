/**
 * test_risk_engine.js — Unit tests for the risk reconciliation engine.
 *
 * Tests Section 3 (reconcileRisk), Section 4 (instrumentRiskTier),
 * Section 5 (eligibility gates), Section 6 (allocation targets),
 * and cache hash divergence — all without Redis or MongoDB.
 */
import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import {
  reconcileRisk,
  instrumentRiskTier,
  filterEligible,
  enforceAllocationTargets,
  runPipeline,
} from '../services/RecommendationPipeline.js';

import { getRiskProfile } from '../services/riskProfiler.js';

test('WG-014: experienceYears parameter does not alter 7-Factor risk score', () => {
  const scoreDefault = getRiskProfile(30, 600000, 15, 0);
  const scoreExp = getRiskProfile(30, 600000, 15, 10);
  assert.equal(scoreDefault.riskScore, scoreExp.riskScore, 'experienceYears parameter must not alter risk score');
});

// ═══════════════════════════════════════════════════════════════════
// 1. reconcileRisk: C = T baseline → advisory_note === ''
// ═══════════════════════════════════════════════════════════════════
test('reconcileRisk: C = T → no advisory note', () => {
  const profile = { riskCategory: 'Moderate', risk_tolerance: 'Moderate' };
  const result = reconcileRisk(profile);
  assert.equal(result.advisory_note, '', 'No advisory note when C and T align');
  assert.equal(result.capacity_missing, false);
  assert.equal(result.preference_missing, false);
  assert.equal(result.final_risk_tier, 'Moderate');
  // C = encodeRiskCategory('Moderate') + 1 = 2 + 1 = 3. T = 3.
  // MIN(3, 3+1) = MIN(3, 4) = 3. final_score = 3.
  assert.equal(result.final_score, 3);
  assert.equal(result.capacity_score, 3);
  assert.equal(result.preference_score, 3);
});

// ═══════════════════════════════════════════════════════════════════
// 2. reconcileRisk: Missing C or T → correct *_missing flags
// ═══════════════════════════════════════════════════════════════════
test('reconcileRisk: missing C → capacity_missing = true', () => {
  const profile = { risk_tolerance: 'Aggressive' }; // no riskCategory
  const result = reconcileRisk(profile);
  assert.equal(result.capacity_missing, true);
  assert.equal(result.preference_missing, false);
  assert.equal(result.final_score, 5); // T = 5, used as-is
  assert.equal(result.final_risk_tier, 'Aggressive');
});

test('reconcileRisk: missing T → preference_missing = true', () => {
  const profile = { riskCategory: 'Conservative' }; // no risk_tolerance
  const result = reconcileRisk(profile);
  assert.equal(result.preference_missing, true);
  assert.equal(result.capacity_missing, false);
  // C = encodeRiskCategory('Conservative') + 1 = 0 + 1 = 1
  assert.equal(result.final_score, 1);
  assert.equal(result.final_risk_tier, 'Conservative');
});

test('reconcileRisk: both missing → flags set, defaults to Moderate (tier 3)', () => {
  const result = reconcileRisk({});
  assert.equal(result.capacity_missing, true);
  assert.equal(result.preference_missing, true);
  assert.equal(result.final_score, 3);
  assert.equal(result.final_risk_tier, 'Moderate');
});

// ═══════════════════════════════════════════════════════════════════
// 2b. reconcileRisk: C ≠ T with |C-T| > 2 → advisory_note populated
// ═══════════════════════════════════════════════════════════════════
test('reconcileRisk: large mismatch (C=1, T=5) → advisory_note populated', () => {
  const profile = { riskCategory: 'Conservative', risk_tolerance: 'Aggressive' };
  const result = reconcileRisk(profile);
  assert.ok(result.advisory_note.length > 0, 'Advisory note should be populated for |C-T| > 2');
  // C = 1, T = 5. MIN(5, 1+1) = 2. final_score = 2.
  assert.equal(result.final_score, 2);
  assert.equal(result.final_risk_tier, 'Conservative-Moderate');
});

test('reconcileRisk: preference pulls DOWN freely (T < C)', () => {
  // C = Aggressive (encodeRiskCategory=4, +1=5), T = Conservative (1)
  const profile = { riskCategory: 'Aggressive', risk_tolerance: 'Conservative' };
  const result = reconcileRisk(profile);
  // MIN(1, 5+1) = MIN(1, 6) = 1, clamped to [1,5] = 1
  assert.equal(result.final_score, 1);
  assert.equal(result.final_risk_tier, 'Conservative');
  assert.ok(result.advisory_note.length > 0, 'Large mismatch should have advisory');
});

test('reconcileRisk: preference can only pull UP by +1 past capacity', () => {
  // C = Conservative (1), T = Moderate (3)
  const profile = { riskCategory: 'Conservative', risk_tolerance: 'Moderate' };
  const result = reconcileRisk(profile);
  // MIN(3, 1+1) = MIN(3, 2) = 2
  assert.equal(result.final_score, 2);
  assert.equal(result.final_risk_tier, 'Conservative-Moderate');
});

// ═══════════════════════════════════════════════════════════════════
// 3. Section 5: Eligibility gates (Sukanya, SCSS, NPS warning, tier hard-exclude)
// ═══════════════════════════════════════════════════════════════════
test('filterEligible: Sukanya rejected without girl child', () => {
  const instruments = [
    { id: 'sukanya', name: 'Sukanya Samriddhi', eligibility: { hasGirlChild: true } },
    { id: 'ppf', name: 'PPF', eligibility: {} },
  ];
  const profile = { age: 30, monthly_income: 50000 };
  const { eligible, excluded } = filterEligible(instruments, profile);
  assert.equal(eligible.length, 1);
  assert.equal(eligible[0].id, 'ppf');
  assert.ok(excluded.some(e => e.instrument === 'Sukanya Samriddhi'));
});

test('filterEligible: SCSS rejected under age 60', () => {
  const instruments = [
    { id: 'scss', name: 'SCSS', eligibility: { minAge: 60 } },
    { id: 'fd', name: 'FD', eligibility: {} },
  ];
  const profile = { age: 45, monthly_income: 50000 };
  const { eligible, excluded } = filterEligible(instruments, profile);
  assert.equal(eligible.length, 1);
  assert.equal(eligible[0].id, 'fd');
  assert.ok(excluded.some(e => e.reason.includes('Age 45 below minimum 60')));
});

test('filterEligible: SCSS accepted at age 60', () => {
  const instruments = [
    { id: 'scss', name: 'SCSS', eligibility: { minAge: 60 } },
  ];
  const profile = { age: 60, monthly_income: 50000 };
  const { eligible } = filterEligible(instruments, profile);
  assert.equal(eligible.length, 1);
  assert.equal(eligible[0].id, 'scss');
});

test('filterEligible: NPS horizon warning tracked', () => {
  const instruments = [
    { id: 'nps', name: 'NPS', eligibility: {} },
  ];
  const profile = { age: 30, monthly_income: 50000, investment_horizon: 10 };
  // 60 - 30 = 30 years to retirement, horizon = 10 < 30 → should warn
  const { eligible, excluded } = filterEligible(instruments, profile);
  assert.equal(eligible.length, 1, 'NPS should still be eligible (warning only)');
  assert.ok(excluded.some(e => e.type === 'warning' && e.reason.includes('NPS WARNING')));
});

// ═══════════════════════════════════════════════════════════════════
// 4. Section 5: Tier ≤ 2 → zero HIGH-tier instruments
// ═══════════════════════════════════════════════════════════════════
test('filterEligible: tier ≤ 2 hard-excludes HIGH-tier instruments', () => {
  const instruments = [
    { id: 'equity_mf', name: 'Equity MF', dynamicData: { risk: { value: 5 } } },
    { id: 'ppf', name: 'PPF', dynamicData: { risk: { value: 1 } } },
    { id: 'debt_mf', name: 'Debt MF', dynamicData: { risk: { value: 3 } } },
  ];
  const profile = { age: 30, monthly_income: 50000 };
  const { eligible, excluded } = filterEligible(instruments, profile, 2);
  assert.ok(!eligible.some(inv => inv.id === 'equity_mf'), 'HIGH instrument should be excluded for tier 2');
  assert.ok(eligible.some(inv => inv.id === 'ppf'), 'LOW instrument should be included');
  assert.ok(eligible.some(inv => inv.id === 'debt_mf'), 'MEDIUM instrument should be included');
  assert.ok(excluded.some(e => e.reason.includes('HIGH-tier instrument hard-excluded')));
});

test('filterEligible: tier 3 does NOT hard-exclude HIGH-tier instruments', () => {
  const instruments = [
    { id: 'equity_mf', name: 'Equity MF', dynamicData: { risk: { value: 5 } } },
  ];
  const profile = { age: 30, monthly_income: 50000 };
  const { eligible } = filterEligible(instruments, profile, 3);
  assert.equal(eligible.length, 1, 'HIGH instrument should pass for tier 3');
});

// ═══════════════════════════════════════════════════════════════════
// 5. Section 6: allocation_pct sum ≈ 100 at every tier
// ═══════════════════════════════════════════════════════════════════
test('enforceAllocationTargets: allocation_pct sums to 100 for each tier', () => {
  const makeInstruments = () => [
    { score: 8, dynamicData: { risk: { value: 1 } } },
    { score: 6, dynamicData: { risk: { value: 3 } } },
    { score: 4, dynamicData: { risk: { value: 5 } } },
  ];
  const profile = { emergency_fund_months: 6 };

  for (let tier = 1; tier <= 5; tier++) {
    const instruments = makeInstruments();
    enforceAllocationTargets(instruments, tier, profile);
    const sum = instruments.reduce((s, i) => s + i.allocation_pct, 0);
    assert.ok(
      Math.abs(sum - 100) <= 1,
      `Tier ${tier}: allocation_pct sum ${sum} should be 100 ± 1`
    );
    // Also verify allocationWeight consistency
    instruments.forEach(inv => {
      assert.ok(
        Math.abs(inv.allocationWeight - inv.allocation_pct / 100) < 0.01,
        `allocationWeight should match allocation_pct/100`
      );
    });
  }
});

// ═══════════════════════════════════════════════════════════════════
// 6. instrumentRiskTier: catalog items map to correct bucket
// ═══════════════════════════════════════════════════════════════════
test('instrumentRiskTier: 1-2 → Low, 3 → Medium, 4-5 → High', () => {
  assert.equal(instrumentRiskTier({ dynamicData: { risk: { value: 1 } } }), 'Low');
  assert.equal(instrumentRiskTier({ dynamicData: { risk: { value: 2 } } }), 'Low');
  assert.equal(instrumentRiskTier({ dynamicData: { risk: { value: 3 } } }), 'Medium');
  assert.equal(instrumentRiskTier({ dynamicData: { risk: { value: 4 } } }), 'High');
  assert.equal(instrumentRiskTier({ dynamicData: { risk: { value: 5 } } }), 'High');
});

test('instrumentRiskTier: fallback to riskLevel when dynamicData missing', () => {
  assert.equal(instrumentRiskTier({ riskLevel: 2 }), 'Low');
  assert.equal(instrumentRiskTier({ riskLevel: 4 }), 'High');
  assert.equal(instrumentRiskTier({}), 'Medium'); // default 3
});

// ═══════════════════════════════════════════════════════════════════
// 7. Cache hash divergence: profiles differing only in a single field
//    produce different hashes. No Redis required.
// ═══════════════════════════════════════════════════════════════════

// Mirror of the production buildProfileHash from recommend.js
function buildProfileHash(profile) {
  return crypto.createHash('sha256').update(JSON.stringify({
    age: profile.age,
    income: profile.annualIncome,
    savings: profile.savings,
    riskCategory: profile.riskCategory,
    risk_tolerance: profile.risk_tolerance,
    regime: profile.taxRegime,
    horizon: profile.investmentHorizon,
    emergency_fund_months: profile.emergency_fund_months,
    hasLumpSum: profile.hasLumpSum,
    lumpSumAmount: profile.lumpSumAmount,
    soldPropertyAmount: profile.soldPropertyAmount,
    liquid_savings: profile.liquid_savings,
    existing_debt: profile.existing_debt,
    dependents: profile.dependents,
    goal_type: profile.goal_type,
  })).digest('hex').substring(0, 16);
}

const BASE_HASH_PROFILE = {
  age: 30, annualIncome: 600000, savings: 10000,
  riskCategory: 'Moderate', risk_tolerance: 'Moderate',
  taxRegime: 'new', investmentHorizon: 15,
  emergency_fund_months: 6, hasLumpSum: false, lumpSumAmount: 0,
  soldPropertyAmount: 0, liquid_savings: 50000, existing_debt: 0,
  dependents: 0, goal_type: 'wealth-building',
};

test('buildProfileHash: different risk_tolerance → different hash', () => {
  const h1 = buildProfileHash({ ...BASE_HASH_PROFILE, risk_tolerance: 'Conservative' });
  const h2 = buildProfileHash({ ...BASE_HASH_PROFILE, risk_tolerance: 'Aggressive' });
  const h3 = buildProfileHash({ ...BASE_HASH_PROFILE, risk_tolerance: 'Moderate' });
  assert.notEqual(h1, h2);
  assert.notEqual(h1, h3);
  assert.notEqual(h2, h3);
  // Deterministic
  assert.equal(h3, buildProfileHash({ ...BASE_HASH_PROFILE, risk_tolerance: 'Moderate' }));
});

test('buildProfileHash: different riskCategory → different hash', () => {
  const h1 = buildProfileHash({ ...BASE_HASH_PROFILE, riskCategory: 'Conservative' });
  const h2 = buildProfileHash({ ...BASE_HASH_PROFILE, riskCategory: 'Aggressive' });
  assert.notEqual(h1, h2, 'Different riskCategory → different hash');
});

test('buildProfileHash: emergency_fund_months divergence busts cache', () => {
  const h1 = buildProfileHash({ ...BASE_HASH_PROFILE, emergency_fund_months: 6 });
  const h2 = buildProfileHash({ ...BASE_HASH_PROFILE, emergency_fund_months: 1 });
  assert.notEqual(h1, h2, 'Different emergency_fund_months → different hash');
});

test('buildProfileHash: lumpSumAmount divergence busts cache', () => {
  const h1 = buildProfileHash({ ...BASE_HASH_PROFILE, hasLumpSum: false, lumpSumAmount: 0 });
  const h2 = buildProfileHash({ ...BASE_HASH_PROFILE, hasLumpSum: true, lumpSumAmount: 500000 });
  assert.notEqual(h1, h2, 'Different lumpSum → different hash');
});

test('buildProfileHash: soldPropertyAmount divergence busts cache', () => {
  const h1 = buildProfileHash({ ...BASE_HASH_PROFILE, soldPropertyAmount: 0 });
  const h2 = buildProfileHash({ ...BASE_HASH_PROFILE, soldPropertyAmount: 3000000 });
  assert.notEqual(h1, h2, 'Different soldPropertyAmount → different hash');
});

test('buildProfileHash: existing_debt divergence busts cache', () => {
  const h1 = buildProfileHash({ ...BASE_HASH_PROFILE, existing_debt: 0 });
  const h2 = buildProfileHash({ ...BASE_HASH_PROFILE, existing_debt: 50 });
  assert.notEqual(h1, h2, 'Different existing_debt → different hash');
});

