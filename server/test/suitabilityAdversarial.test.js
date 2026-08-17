import test from 'node:test';
import assert from 'node:assert/strict';
import { runPipeline, resolveConcentrationCap } from '../services/RecommendationPipeline.js';

test('PHASE 3 — Adversarial Suitability & Multi-Instrument Concentration Gaming Defense', async (t) => {

  await t.test('Scenario 1: Conservative Near-Retirement Investor (Age 62) with Manipulated Horizon Input', () => {
    // Adversarial Profile: 62-year-old retired investor, low risk capacity,
    // but manipulated horizon (25 years) and high savings to trick heuristic/ML models into high equity
    const profile = {
      age: 62,
      annualIncome: 1200000,
      savings: 40000,
      riskCategory: 'Conservative',
      risk_tolerance: 'Conservative',
      investmentHorizon: 25, // Manipulated input
      taxRegime: 'new',
      emergency_fund_months: 6,
      liquid_savings: 800000,
      existing_debt: 0,
      dependents: 1,
      goal_type: 'retirement',
    };

    const mlResult = {
      fallback: true,
      decision_path: 'RuleEngineFallback',
      confidence_scores: { Low: 0.85, Medium: 0.12, High: 0.03 },
    };

    const result = runPipeline(profile, mlResult);

    console.log(`\n[Scenario 1: Conservative Near-Retirement Profile]`);
    console.log(`  Final Reconciled Tier: ${result.riskReconciliation.final_risk_tier}`);
    console.log(`  Capacity Score: ${result.riskReconciliation.capacity_score}, Preference: ${result.riskReconciliation.preference_score}`);
    console.log(`  Instruments Recommended (${result.instruments.length}):`);
    
    let lowSum = 0;
    let highSum = 0;

    result.instruments.forEach(inst => {
      console.log(`    - ${inst.name} [Tier: ${inst.tier || 'N/A'}, Type: ${inst.backendType || inst.type}]: ${inst.allocation_pct}%`);
      if (inst.tier === 'Low') lowSum += inst.allocation_pct;
      if (inst.tier === 'High') highSum += inst.allocation_pct;
    });

    console.log(`  Aggregate Allocations -> Low Risk: ${lowSum.toFixed(1)}%, High Risk: ${highSum.toFixed(1)}%`);

    // Invariants for Conservative Investor:
    // 1. High risk equity/smallcap allocation must NOT exceed 10.0%
    // 2. Low risk capital preservation assets must be at least 65.0%
    assert.equal(result.riskReconciliation.final_risk_tier, 'Conservative');
    assert.ok(highSum <= 10.05, `High risk allocation (${highSum}%) exceeds 10% ceiling for Conservative investor`);
    assert.ok(lowSum >= 65.0, `Low risk allocation (${lowSum}%) is below 65% floor for Conservative investor`);

    const totalAlloc = parseFloat(result.instruments.reduce((s, i) => s + i.allocation_pct, 0).toFixed(1));
    assert.equal(totalAlloc, 100.0, `Total allocation (${totalAlloc}%) must equal 100.0%`);
  });

  await t.test('Scenario 2: Aggressive Multi-Instrument Smallcap Concentration Gaming Attempt', () => {
    // Adversarial profile: Aggressive investor with high savings
    const profile = {
      age: 26,
      annualIncome: 3000000,
      savings: 120000,
      riskCategory: 'Aggressive',
      risk_tolerance: 'Aggressive',
      investmentHorizon: 20,
      taxRegime: 'new',
      emergency_fund_months: 6,
      liquid_savings: 600000,
      existing_debt: 5,
      dependents: 0,
      goal_type: 'wealth-building',
    };

    const mlResult = {
      fallback: true,
      decision_path: 'RuleEngineFallback',
      confidence_scores: { Low: 0.10, Medium: 0.25, High: 0.65 },
    };

    const result = runPipeline(profile, mlResult);

    console.log(`\n[Scenario 2: Aggressive Multi-Instrument Concentration Defense]`);
    console.log(`  Final Reconciled Tier: ${result.riskReconciliation.final_risk_tier}`);
    console.log(`  Instruments Recommended (${result.instruments.length}):`);

    let smallcapAggregate = 0;
    let midcapAggregate = 0;

    result.instruments.forEach(inst => {
      console.log(`    - ${inst.name} [Type: ${inst.backendType || inst.type}, CapKey: ${resolveConcentrationCap(inst)?.key || 'none'}]: ${inst.allocation_pct}%`);
      const capKey = resolveConcentrationCap(inst)?.key;
      if (capKey === 'smallcap_mf') smallcapAggregate += inst.allocation_pct;
      if (capKey === 'midcap_mf') midcapAggregate += inst.allocation_pct;
    });

    console.log(`  Smallcap Aggregate: ${smallcapAggregate.toFixed(1)}% (Cap: 15%)`);
    console.log(`  Midcap Aggregate: ${midcapAggregate.toFixed(1)}% (Cap: 20%)`);

    // Invariants:
    // 1. Total Smallcap allocation across all instruments combined must be <= 15.0%
    // 2. Total Midcap allocation across all instruments combined must be <= 20.0%
    assert.ok(
      smallcapAggregate <= 15.05,
      `Smallcap aggregate concentration (${smallcapAggregate.toFixed(1)}%) breached statutory 15% cap!`
    );
    assert.ok(
      midcapAggregate <= 20.05,
      `Midcap aggregate concentration (${midcapAggregate.toFixed(1)}%) breached statutory 20% cap!`
    );

    const totalAlloc = parseFloat(result.instruments.reduce((s, i) => s + i.allocation_pct, 0).toFixed(1));
    assert.equal(totalAlloc, 100.0, `Total allocation (${totalAlloc}%) must equal 100.0%`);
  });

  await t.test('Scenario 3: Risk Reconciliation Pull-Down Safeguard (Aggressive Preference vs Conservative Capacity)', () => {
    // Mismatched profile: Conservative Capacity (Age 59, High Debt, Low Emergency Fund) but Aggressive Preference
    const profile = {
      age: 59,
      annualIncome: 1000000,
      savings: 10000,
      riskCategory: 'Conservative',  // Capacity = 1
      risk_tolerance: 'Aggressive',    // Preference = 5 (Trying to force 70% equity)
      investmentHorizon: 5,
      taxRegime: 'new',
      emergency_fund_months: 1,      // Inadequate emergency fund (< 3 months)
      liquid_savings: 50000,
      existing_debt: 45,
      dependents: 3,
      goal_type: 'retirement',
    };

    const mlResult = {
      fallback: true,
      decision_path: 'RuleEngineFallback',
      confidence_scores: { Low: 0.70, Medium: 0.20, High: 0.10 },
    };

    const result = runPipeline(profile, mlResult);

    console.log(`\n[Scenario 3: Mismatched Profile Reconciliation Safeguard]`);
    console.log(`  Computed Capacity: ${result.riskReconciliation.capacity_score} (${profile.riskCategory})`);
    console.log(`  Stated Preference: ${result.riskReconciliation.preference_score} (${profile.risk_tolerance})`);
    console.log(`  Reconciled Final Tier: ${result.riskReconciliation.final_risk_tier}`);
    console.log(`  Advisory Note: "${result.riskReconciliation.advisory_note}"`);

    // Invariant: Preference cannot pull up past Capacity + 1 (C=1 -> Max Tier=2: Conservative-Moderate)
    assert.equal(result.riskReconciliation.final_score, 2);
    assert.equal(result.riskReconciliation.final_risk_tier, 'Conservative-Moderate');
    assert.ok(result.riskReconciliation.advisory_note.includes('Significant mismatch'));

    // Verify Low tier is topped up due to emergency fund < 3 months
    let lowSum = 0;
    result.instruments.forEach(inst => {
      if (inst.tier === 'Low') lowSum += inst.allocation_pct;
    });
    assert.ok(lowSum >= 45.0, `Low risk allocation (${lowSum}%) must be at least 45% for Conservative-Moderate`);
  });
});
