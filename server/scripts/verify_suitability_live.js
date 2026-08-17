import 'dotenv/config';
import axios from 'axios';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import assert from 'node:assert/strict';

const BASE_URL = 'http://127.0.0.1:5000';
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET environment variable is required to run live verification scripts.');
  process.exit(1);
}

async function runLiveSuitabilityVerification() {
  console.log(`\n================================================================`);
  console.log(`[${new Date().toISOString()}] PHASE 3: LIVE ADVERSARIAL SUITABILITY & CONCENTRATION TEST`);
  console.log(`================================================================`);

  const userId = crypto.randomBytes(12).toString('hex');
  const token = jwt.sign({ userId, email: `suitability_test_${Date.now()}@wealthgenie.io`, role: 'user' }, JWT_SECRET, { expiresIn: '1h' });

  const client = axios.create({
    baseURL: BASE_URL,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });

  // ----------------------------------------------------
  // Scenario 1: Conservative Senior Citizen (Manipulated Horizon)
  // ----------------------------------------------------
  console.log(`\n[Live Scenario 1] Conservative Senior Citizen (Age 65, Horizon Manipulated to 25 yrs)...`);
  const prof1Res = await client.post('/api/profile/build', {
    age: 65,
    monthly_income: 120000,
    monthly_savings: 30000,
    liquid_savings: 800000,
    existing_debt: 0,
    dependents: 1,
    emergency_fund_months: 12,
    investment_horizon: 25,
    risk_tolerance: 'Conservative',
    goal_type: 'retirement',
  });
  const prof1Id = prof1Res.data.profileId || prof1Res.data.profile_id || prof1Res.data._id;

  const rec1Res = await client.post('/api/recommend', { profileId: prof1Id });
  console.log(`  Recommendation ID: ${rec1Res.data.recommendationId}`);
  console.log(`  Final Risk Tier: ${rec1Res.data.final_risk_tier}`);
  console.log(`  Capacity Score: ${rec1Res.data.capacity_score}, Preference Score: ${rec1Res.data.preference_score}`);
  console.log(`  Reconciliation Note: ${rec1Res.data.reconciliation_note}`);

  let lowAlloc1 = 0;
  let highAlloc1 = 0;
  rec1Res.data.instruments.forEach(inst => {
    console.log(`    - ${inst.name} [Type: ${inst.type}, Tier: ${inst.tier}]: ${inst.allocation_pct}% (Weight: ${inst.allocationWeight})`);
    if (inst.tier === 'Low') lowAlloc1 += inst.allocation_pct;
    if (inst.tier === 'High') highAlloc1 += inst.allocation_pct;
  });
  console.log(`  Total Low Risk: ${lowAlloc1.toFixed(1)}%, Total High Risk: ${highAlloc1.toFixed(1)}%`);

  assert.equal(rec1Res.data.final_risk_tier, 'Conservative');
  assert.ok(highAlloc1 <= 10.05, `High risk allocation must be <= 10%`);
  assert.ok(lowAlloc1 >= 65.0, `Low risk allocation must be >= 65%`);

  // ----------------------------------------------------
  // Scenario 2: Aggressive Multi-Instrument Concentration Gaming
  // ----------------------------------------------------
  console.log(`\n[Live Scenario 2] Aggressive Profile (Attempting Multi-Instrument Concentration Bypass)...`);
  const prof2Res = await client.post('/api/profile/build', {
    age: 26,
    monthly_income: 250000,
    monthly_savings: 100000,
    liquid_savings: 500000,
    existing_debt: 5,
    dependents: 0,
    emergency_fund_months: 6,
    investment_horizon: 20,
    risk_tolerance: 'Aggressive',
    goal_type: 'wealth-building',
  });
  const prof2Id = prof2Res.data.profileId || prof2Res.data.profile_id || prof2Res.data._id;

  const rec2Res = await client.post('/api/recommend', { profileId: prof2Id });
  console.log(`  Recommendation ID: ${rec2Res.data.recommendationId}`);
  console.log(`  Final Risk Tier: ${rec2Res.data.final_risk_tier}`);

  let smallcapAlloc = 0;
  let midcapAlloc = 0;
  rec2Res.data.instruments.forEach(inst => {
    console.log(`    - ${inst.name} [Type: ${inst.type}]: ${inst.allocation_pct}% (Weight: ${inst.allocationWeight})`);
    const typeLower = (inst.type || '').toLowerCase();
    const nameLower = (inst.name || '').toLowerCase();
    if (typeLower.includes('smallcap') || nameLower.includes('small-cap') || nameLower.includes('small cap')) smallcapAlloc += inst.allocation_pct;
    if (typeLower.includes('midcap') || nameLower.includes('mid-cap') || nameLower.includes('mid cap')) midcapAlloc += inst.allocation_pct;
  });

  console.log(`  Aggregate Smallcap: ${smallcapAlloc.toFixed(1)}% (Cap: 15%)`);
  console.log(`  Aggregate Midcap: ${midcapAlloc.toFixed(1)}% (Cap: 20%)`);

  assert.ok(smallcapAlloc <= 15.05, `Smallcap aggregate must be <= 15%`);
  assert.ok(midcapAlloc <= 20.05, `Midcap aggregate must be <= 20%`);

  // ----------------------------------------------------
  // Scenario 3: Mismatch Safeguard (Capacity C=1 vs Preference T=5)
  // ----------------------------------------------------
  console.log(`\n[Live Scenario 3] Mismatched Profile Safeguard (Capacity C=1 vs Preference T=5)...`);
  const prof3Res = await client.post('/api/profile/build', {
    age: 58,
    monthly_income: 90000,
    monthly_savings: 10000,
    liquid_savings: 50000,
    existing_debt: 40,
    dependents: 3,
    emergency_fund_months: 1,
    investment_horizon: 5,
    risk_tolerance: 'Aggressive',
    goal_type: 'retirement',
  });
  const prof3Id = prof3Res.data.profileId || prof3Res.data.profile_id || prof3Res.data._id;

  const rec3Res = await client.post('/api/recommend', { profileId: prof3Id });
  console.log(`  Recommendation ID: ${rec3Res.data.recommendationId}`);
  console.log(`  Capacity Score: ${rec3Res.data.capacity_score}, Stated Preference: ${rec3Res.data.preference_score}`);
  console.log(`  Final Risk Tier: ${rec3Res.data.final_risk_tier}`);
  console.log(`  Advisory Note: "${rec3Res.data.advisory_note}"`);

  assert.equal(rec3Res.data.capacity_score, 2);
  assert.equal(rec3Res.data.final_risk_tier, 'Moderate');
  assert.ok(rec3Res.data.advisory_note.includes('Significant mismatch'));

  console.log(`\n================================================================`);
  console.log(`✅ All Live Adversarial Suitability and Concentration Tests Passed!`);
  console.log(`================================================================\n`);
}

runLiveSuitabilityVerification().catch(err => {
  console.error('Suitability Verification Failed:', err.response?.data || err);
  process.exit(1);
});
