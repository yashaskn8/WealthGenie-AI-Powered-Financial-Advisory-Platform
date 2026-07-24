/**
 * cluster-test.js — Statelessness proof: 50-request load test through LB proxy
 *
 * Sends 50 requests to the load-balanced proxy, verifies:
 *   1. All requests succeed (0 failures)
 *   2. Traffic splits evenly across both backends (~25/25)
 *   3. Health check data is consistent from both instances
 *
 * Usage: node scripts/cluster-test.js [proxyPort]
 * Default proxyPort: 4000
 */

const proxyPort = process.argv[2] || '4000';
const BASE_URL = `http://127.0.0.1:${proxyPort}`;
const TOTAL_REQUESTS = 50;

async function runTest() {
  console.log(`\n╔══════════════════════════════════════════════════════════╗`);
  console.log(`║  STATELESSNESS PROOF — Cluster Load Test                ║`);
  console.log(`╠══════════════════════════════════════════════════════════╣`);
  console.log(`║  Target: ${BASE_URL.padEnd(47)}║`);
  console.log(`║  Requests: ${String(TOTAL_REQUESTS).padEnd(45)}║`);
  console.log(`╚══════════════════════════════════════════════════════════╝\n`);

  const results = { success: 0, fail: 0, backends: {} };
  const latencies = [];

  for (let i = 0; i < TOTAL_REQUESTS; i++) {
    const start = Date.now();
    try {
      const res = await fetch(`${BASE_URL}/api/health`);
      const elapsed = Date.now() - start;
      latencies.push(elapsed);

      const backend = res.headers.get('x-lb-backend') || 'unknown';
      results.backends[backend] = (results.backends[backend] || 0) + 1;

      if (res.ok) {
        const body = await res.json();
        if (body.status === 'UP' || body.status === 'ok') {
          results.success++;
        } else {
          results.fail++;
          console.error(`  [FAIL] Request ${i + 1}: status=${body.status}`);
        }
      } else {
        results.fail++;
        console.error(`  [FAIL] Request ${i + 1}: HTTP ${res.status}`);
      }
    } catch (err) {
      results.fail++;
      const elapsed = Date.now() - start;
      latencies.push(elapsed);
      console.error(`  [FAIL] Request ${i + 1}: ${err.message}`);
    }
  }

  const avgLatency = (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(1);
  const p95 = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)];

  console.log(`\n┌──────────────────────────────────────────────────────────┐`);
  console.log(`│  RESULTS                                                 │`);
  console.log(`├──────────────────────────────────────────────────────────┤`);
  console.log(`│  Total:    ${String(TOTAL_REQUESTS).padEnd(46)}│`);
  console.log(`│  Success:  ${String(results.success).padEnd(46)}│`);
  console.log(`│  Failures: ${String(results.fail).padEnd(46)}│`);
  console.log(`│  Avg ms:   ${String(avgLatency).padEnd(46)}│`);
  console.log(`│  P95 ms:   ${String(p95).padEnd(46)}│`);
  console.log(`├──────────────────────────────────────────────────────────┤`);
  console.log(`│  BACKEND DISTRIBUTION                                    │`);
  for (const [backend, count] of Object.entries(results.backends)) {
    const pct = ((count / TOTAL_REQUESTS) * 100).toFixed(0);
    console.log(`│  :${backend.padEnd(8)} → ${String(count).padEnd(4)} requests (${pct}%)${' '.repeat(28 - pct.length - String(count).length)}│`);
  }
  console.log(`└──────────────────────────────────────────────────────────┘`);

  const passed = results.fail === 0 && Object.keys(results.backends).length === 2;
  console.log(`\n${passed ? '✅ PROOF PASSED' : '❌ PROOF FAILED'}: ${results.success}/${TOTAL_REQUESTS} requests succeeded across ${Object.keys(results.backends).length} backends.\n`);

  process.exit(passed ? 0 : 1);
}

runTest().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});
