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
// 7. Cache hash divergence: profiles differing only in risk_tolerance
//    produce different hashes. No Redis required.
// ═══════════════════════════════════════════════════════════════════
test('buildProfileHash: different risk_tolerance → different hash', () => {
  function buildProfileHash(profile) {
    return crypto.createHash('sha256').update(JSON.stringify({
      age: profile.age,
      income: profile.annualIncome,
      savings: profile.savings,
      riskCategory: profile.riskCategory,
      risk_tolerance: profile.risk_tolerance,
      regime: profile.taxRegime,
      horizon: profile.investmentHorizon,
    })).digest('hex').substring(0, 16);
  }

  const baseProfile = {
    age: 30,
    annualIncome: 600000,
    savings: 10000,
    riskCategory: 'Moderate',
    taxRegime: 'new',
    investmentHorizon: 15,
  };

  const hashConservative = buildProfileHash({ ...baseProfile, risk_tolerance: 'Conservative' });
  const hashAggressive = buildProfileHash({ ...baseProfile, risk_tolerance: 'Aggressive' });
  const hashModerate = buildProfileHash({ ...baseProfile, risk_tolerance: 'Moderate' });

  assert.notEqual(hashConservative, hashAggressive, 'Conservative and Aggressive should produce different hashes');
  assert.notEqual(hashConservative, hashModerate, 'Conservative and Moderate should produce different hashes');
  assert.notEqual(hashModerate, hashAggressive, 'Moderate and Aggressive should produce different hashes');

  // Same profile → same hash (deterministic)
  const hash1 = buildProfileHash({ ...baseProfile, risk_tolerance: 'Moderate' });
  const hash2 = buildProfileHash({ ...baseProfile, risk_tolerance: 'Moderate' });
  assert.equal(hash1, hash2, 'Same profile should produce identical hash');
});

test('buildProfileHash: different riskCategory → different hash', () => {
  function buildProfileHash(profile) {
    return crypto.createHash('sha256').update(JSON.stringify({
      age: profile.age,
      income: profile.annualIncome,
      savings: profile.savings,
      riskCategory: profile.riskCategory,
      risk_tolerance: profile.risk_tolerance,
      regime: profile.taxRegime,
      horizon: profile.investmentHorizon,
    })).digest('hex').substring(0, 16);
  }

  const base = {
    age: 30, annualIncome: 600000, savings: 10000,
    risk_tolerance: 'Moderate', taxRegime: 'new', investmentHorizon: 15,
  };

  const h1 = buildProfileHash({ ...base, riskCategory: 'Conservative' });
  const h2 = buildProfileHash({ ...base, riskCategory: 'Aggressive' });
  assert.notEqual(h1, h2, 'Different riskCategory → different hash');
});
