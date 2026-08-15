import crypto from 'crypto';

const BASE_URL = 'http://127.0.0.1:5000/api';

async function run() {
  console.log('=== CHECK 2: LIVE AUDIT TRAIL VERIFICATION ===\n');

  const randomSuffix = crypto.randomBytes(4).toString('hex');
  const user1Email = `audit_tester_1_${randomSuffix}@test.com`;
  const user2Email = `audit_tester_2_${randomSuffix}@test.com`;
  const password = 'Password@1234';

  // --- Step 1: Register User 1 and create profile ---
  console.log('[Step 1] Registering User 1 (' + user1Email + ')...');
  const reg1Res = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Audit Tester One',
      email: user1Email,
      password,
    }),
  });
  const reg1Data = await reg1Res.json();
  const token1 = reg1Data.token;
  console.log(`  User 1 registered (HTTP ${reg1Res.status}), token acquired.`);

  console.log('[Step 1] Building financial profile for User 1 (POST /api/profile/build)...');
  const profilePayload = {
    monthly_income: 150000,
    age: 32,
    monthly_savings: 60000,
    liquid_savings: 500000,
    regime: 'new',
    investment_horizon: 15,
    existing_debt: 10,
    dependents: 1,
    emergency_fund_months: 6,
    risk_tolerance: 'Aggressive',
    goal_type: 'wealth-building',
  };

  const profileRes = await fetch(`${BASE_URL}/profile/build`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token1}`,
    },
    body: JSON.stringify(profilePayload),
  });
  const profileData = await profileRes.json();
  const profileId = profileData.profileId || profileData.profile_id || profileData._id;
  console.log(`  Profile created with ID: ${profileId} (HTTP ${profileRes.status})`);

  console.log('[Step 1] Requesting recommendation (POST /api/recommend)...');
  const recRes = await fetch(`${BASE_URL}/recommend`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token1}`,
    },
    body: JSON.stringify({ profileId }),
  });
  const recData = await recRes.json();

  console.log('\n--- Recommendation Response ---');
  console.log(`HTTP Status: ${recRes.status}`);
  console.log(`recommendationId: ${recData.recommendationId}`);
  console.log(`audit_id: ${recData.audit_id}`);
  console.log(`audit_hash: ${recData.audit_hash}`);
  console.log(`model_version: ${recData.model_version}`);
  console.log(`portfolio_yield: ${recData.portfolio_yield}%`);
  console.log(`instruments count: ${recData.instruments?.length}`);

  const auditId = recData.audit_id;
  const auditHash = recData.audit_hash;

  if (!auditId || !auditHash) {
    throw new Error('FAILED: audit_id or audit_hash missing in recommendation response!');
  }

  // --- Step 2: Query GET /api/recommend/audit/:id with SAME user ---
  console.log(`\n[Step 2] Querying GET /api/recommend/audit/${auditId} with User 1 token...`);
  const auditRes = await fetch(`${BASE_URL}/recommend/audit/${auditId}`, {
    headers: { 'Authorization': `Bearer ${token1}` },
  });
  const auditData = await auditRes.json();

  console.log('\n--- User 1 Audit Record Retrieval ---');
  console.log(`HTTP Status: ${auditRes.status}`);
  console.log(JSON.stringify(auditData, null, 2));

  const record = auditData.record;
  if (!record) {
    throw new Error('FAILED: record field missing in audit retrieval response');
  }
  if (record.version_id !== recData.model_version) {
    throw new Error(`Mismatch in model version: expected ${recData.model_version}, got ${record.version_id}`);
  }
  if (record.input_hash !== auditHash) {
    throw new Error(`Mismatch in input hash: expected ${auditHash}, got ${record.input_hash}`);
  }
  console.log('\n>>> VERIFIED: Audit record correctly contains version_id, input_hash, and matching recommendation instruments! <<<');

  // --- Step 3: Attempt GET with DIFFERENT user token ---
  console.log(`\n[Step 3] Registering User 2 (${user2Email})...`);
  const reg2Res = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Audit Tester Two',
      email: user2Email,
      password,
    }),
  });
  const reg2Data = await reg2Res.json();
  const token2 = reg2Data.token;
  console.log(`  User 2 registered (HTTP ${reg2Res.status}), token acquired.`);

  console.log(`[Step 3] Attempting to access User 1's audit record using User 2 token (GET /api/recommend/audit/${auditId})...`);
  const forbiddenRes = await fetch(`${BASE_URL}/recommend/audit/${auditId}`, {
    headers: { 'Authorization': `Bearer ${token2}` },
  });
  const forbiddenData = await forbiddenRes.json();

  console.log('\n--- User 2 Access Attempt Result ---');
  console.log(`HTTP Status: ${forbiddenRes.status} (Expected 403 Forbidden)`);
  console.log('Response body:', JSON.stringify(forbiddenData, null, 2));
  if (forbiddenRes.status === 403) {
    console.log('>>> VERIFIED: Cross-tenant audit access correctly returned 403 Forbidden! <<<');
  } else {
    throw new Error(`Expected HTTP 403 but got HTTP ${forbiddenRes.status}`);
  }

  console.log('\n=== Check 2 Steps 1, 2, and 3 Verified Successfully ===');
}

run().catch(err => {
  console.error('Check 2 test failed:', err);
  process.exit(1);
});
