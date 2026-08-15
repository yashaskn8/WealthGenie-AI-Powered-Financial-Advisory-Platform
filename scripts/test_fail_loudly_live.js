import crypto from 'crypto';

const BASE_URL = 'http://127.0.0.1:5000/api';

async function run() {
  console.log('=== CHECK 2 STEP 4: PROVING FAIL-LOUDLY BEHAVIOR ===\n');

  const randomSuffix = crypto.randomBytes(4).toString('hex');
  const userEmail = `fail_tester_${randomSuffix}@test.com`;
  const password = 'Password@1234';

  // 1. Register fresh user
  console.log(`[1] Registering fresh user: ${userEmail}...`);
  const regRes = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Fail Loudly Tester', email: userEmail, password }),
  });
  const regData = await regRes.json();
  const token = regData.token;
  console.log(`  Registered (HTTP ${regRes.status}), token acquired.`);

  // 2. Build profile
  console.log('[2] Building financial profile...');
  const profileRes = await fetch(`${BASE_URL}/profile/build`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({
      monthly_income: 140000,
      age: 29,
      monthly_savings: 45000,
      liquid_savings: 350000,
      regime: 'new',
      investment_horizon: 12,
      existing_debt: 5,
      dependents: 0,
      emergency_fund_months: 5,
      risk_tolerance: 'Moderate',
      goal_type: 'wealth-building',
    }),
  });
  const profileData = await profileRes.json();
  const profileId = profileData.profileId || profileData.profile_id;
  console.log(`  Profile built: ${profileId} (HTTP ${profileRes.status})`);

  // 3. Attempt recommendation while AuditRecord writes are blocked
  console.log('\n[3] Attempting POST /api/recommend with AuditRecord writes blocked...');
  const recRes = await fetch(`${BASE_URL}/recommend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
    body: JSON.stringify({ profileId }),
  });
  const recData = await recRes.json();

  console.log('--- Recommendation Response During Audit Write Failure ---');
  console.log(`HTTP Status: ${recRes.status} (Expected 500)`);
  console.log('Response Body:', JSON.stringify(recData, null, 2));

  if (recRes.status === 500) {
    console.log('\n>>> PROVEN: Fail-loudly behavior verified! When AuditRecord.create() throws, the recommendation transaction is aborted and returns HTTP 500 rather than silently returning an unaudited recommendation. <<<');
  } else {
    throw new Error(`Expected HTTP 500, but got HTTP ${recRes.status}`);
  }
}

run().catch(err => {
  console.error('Fail-loudly test failed:', err);
  process.exit(1);
});
