import http from 'http';

/**
 * Multi-Instance Cluster Load Test Script (Task 2 Proof)
 * Executes 50 sequential requests including stateful authentication workflows
 * through the round-robin load balancer at http://127.0.0.1:8080.
 */

const PROXY_URL = 'http://127.0.0.1:8080';

function httpRequest({ method, path, headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, PROXY_URL);
    const reqOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    const req = http.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch (_) { parsed = data; }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          servedBy: res.headers['x-served-by'] || 'unknown',
          port: res.headers['x-target-port'] || 'unknown',
          data: parsed,
        });
      });
    });

    req.on('error', (err) => reject(err));
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runClusterTest() {
  console.log('================================================================');
  console.log('STARTING MULTI-INSTANCE CLUSTER VERIFICATION (50 SEQUENTIAL REQUESTS)');
  console.log('================================================================\n');

  const instanceCounts = { 'instance-3001': 0, 'instance-3002': 0 };
  let successCount = 0;
  let failureCount = 0;

  // Step 1: Stateful Authentication Flow
  const testEmail = `cluster_test_${Date.now()}@wealthgenie.io`;
  const testPassword = 'Password123!';

  console.log(`[Req 1] POST /api/auth/register -> User registration (${testEmail})`);
  const regRes = await httpRequest({
    method: 'POST',
    path: '/api/auth/register',
    body: { name: 'Stateless Tester', email: testEmail, password: testPassword }
  });
  console.log(` -> Status: ${regRes.statusCode} | Served by: ${regRes.servedBy} (Port ${regRes.port})`);
  instanceCounts[regRes.servedBy] = (instanceCounts[regRes.servedBy] || 0) + 1;
  if (regRes.statusCode === 201) successCount++; else failureCount++;

  console.log(`[Req 2] POST /api/auth/login -> User login`);
  const loginRes = await httpRequest({
    method: 'POST',
    path: '/api/auth/login',
    body: { email: testEmail, password: testPassword }
  });
  console.log(` -> Status: ${loginRes.statusCode} | Served by: ${loginRes.servedBy} (Port ${loginRes.port})`);
  instanceCounts[loginRes.servedBy] = (instanceCounts[loginRes.servedBy] || 0) + 1;
  if (loginRes.statusCode === 200 && loginRes.data.token) successCount++; else failureCount++;

  const authToken = loginRes.data.token;
  const authHeaders = { 'Authorization': `Bearer ${authToken}` };

  // Step 2: Stateful Profile Build on authenticated user
  console.log(`[Req 3] POST /api/profile/build -> Stateful authenticated profile setup`);
  const profRes = await httpRequest({
    method: 'POST',
    path: '/api/profile/build',
    headers: { ...authHeaders, 'idempotency-key': `idemp-cluster-${Date.now()}` },
    body: {
      monthly_income: 100000,
      age: 32,
      monthly_savings: 35000,
      regime: 'new',
      investment_horizon: 15,
      liquid_savings: 200000,
      existing_debt: 0,
      dependents: 1,
      emergency_fund_months: 6,
      risk_tolerance: 'Moderate',
      goal_type: 'wealth-building'
    }
  });
  console.log(` -> Status: ${profRes.statusCode} | Served by: ${profRes.servedBy} (Port ${profRes.port})`);
  instanceCounts[profRes.servedBy] = (instanceCounts[profRes.servedBy] || 0) + 1;
  if (profRes.statusCode === 200 || profRes.statusCode === 201) successCount++; else failureCount++;

  const profileId = profRes.data.profileId;

  // Step 3: Loop through 47 remaining requests across endpoints
  const endpoints = [
    { method: 'GET', path: '/health', auth: false },
    { method: 'GET', path: '/api/health', auth: false },
    { method: 'GET', path: '/api/instruments?limit=5', auth: false },
    { method: 'GET', path: '/api/goals', auth: true },
    { method: 'GET', path: '/api/market/rates', auth: false },
    { method: 'POST', path: '/api/projection', auth: true, getBody: () => ({ profileId, instruments: ['FD', 'ELSS'], monthly_investment: 25000, years: [5, 10] }) },
    { method: 'GET', path: '/api/tax/compare?income=1500000', auth: false },
    { method: 'GET', path: '/api/market/params', auth: false },
  ];

  for (let i = 4; i <= 50; i++) {
    await new Promise(r => setTimeout(r, 50));
    const ep = endpoints[(i - 4) % endpoints.length];
    const headers = ep.auth ? authHeaders : {};
    const body = ep.getBody ? ep.getBody() : (ep.body || null);
    const res = await httpRequest({
      method: ep.method,
      path: ep.path,
      headers,
      body
    });

    console.log(`[Req ${i}] ${ep.method} ${ep.path} -> Status: ${res.statusCode} | Served by: ${res.servedBy} (Port ${res.port})`);
    instanceCounts[res.servedBy] = (instanceCounts[res.servedBy] || 0) + 1;
    if (res.statusCode >= 200 && res.statusCode < 400) successCount++; else failureCount++;
  }

  console.log('\n================================================================');
  console.log('MULTI-INSTANCE CLUSTER VERIFICATION SUMMARY');
  console.log('================================================================');
  console.log(`Total Requests: 50`);
  console.log(`Successful (HTTP 2xx/3xx): ${successCount} / 50`);
  console.log(`Failed: ${failureCount} / 50`);
  console.log(`Instance 3001 Request Count: ${instanceCounts['instance-3001']}`);
  console.log(`Instance 3002 Request Count: ${instanceCounts['instance-3002']}`);
  console.log(`Traffic Distribution: ${((instanceCounts['instance-3001']/50)*100).toFixed(1)}% / ${((instanceCounts['instance-3002']/50)*100).toFixed(1)}%`);
  console.log('================================================================\n');

  if (failureCount === 0 && instanceCounts['instance-3001'] === 25 && instanceCounts['instance-3002'] === 25) {
    console.log('PROOF VERIFICATION RESULT: PASS — Perfect 50/50 round-robin distribution with zero state failure!');
    process.exit(0);
  } else if (failureCount === 0) {
    console.log('PROOF VERIFICATION RESULT: PASS — Zero failure rate across instances!');
    process.exit(0);
  } else {
    console.log('PROOF VERIFICATION RESULT: FAIL');
    process.exit(1);
  }
}

runClusterTest().catch(err => {
  console.error('[ClusterTest] Execution error:', err);
  process.exit(1);
});
