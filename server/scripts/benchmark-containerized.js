/**
 * Containerized Horizontal Scaling Benchmark
 *
 * Runs the same load test methodology as loadtest.js against:
 *   1. A single app instance (app1 directly, port-forwarded)
 *   2. The NGINX load-balanced pair (lb on port 8080)
 *
 * Prerequisites:
 *   docker compose up --build -d
 *   Wait for all health checks to pass
 *
 * Usage:
 *   node server/scripts/benchmark-containerized.js
 *
 * Parameters match the local simulation for apples-to-apples comparison:
 *   Concurrency: 50, Duration: 15s, Rate-limiting: disabled
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = join(__dirname, '..', 'reports');

const CONCURRENCY = 50;
const DURATION_SECONDS = 15;
const ENDPOINT = '/health/ready';

// Docker compose exposes: app1 not directly (only through LB), so we
// test single-instance by temporarily scaling to 1 replica, or we can
// expose app1 directly. For simplicity, we expose app1 on port 5001
// via docker compose override, or we test against the LB with 1 vs 2 backends.
// The cleanest approach: test LB:8080 with both app1+app2 running.
// For single-instance baseline, stop app2 first.

const SINGLE_INSTANCE_URL = process.env.SINGLE_URL || 'http://127.0.0.1:8080';
const DUAL_INSTANCE_URL = process.env.DUAL_URL || 'http://127.0.0.1:8080';

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function singleRequest(baseUrl) {
  const start = performance.now();
  try {
    const res = await fetch(`${baseUrl}${ENDPOINT}`);
    const latency = performance.now() - start;
    return { status: res.status, latency, error: res.status >= 500 };
  } catch (err) {
    const latency = performance.now() - start;
    return { status: 0, latency, error: true, message: err.message };
  }
}

async function runBatch(baseUrl, batchSize) {
  const promises = [];
  for (let i = 0; i < batchSize; i++) {
    promises.push(singleRequest(baseUrl));
  }
  return Promise.all(promises);
}

async function waitForHealthy(url, maxTimeoutMs = 30000) {
  const start = Date.now();
  console.log(`[Bench] Polling server readiness at ${url}${ENDPOINT}...`);
  while (Date.now() - start < maxTimeoutMs) {
    try {
      const res = await fetch(`${url}${ENDPOINT}`, { signal: AbortSignal.timeout(2000) });
      if (res.status === 200) {
        const elapsed = Date.now() - start;
        console.log(`[Bench] Server is healthy and ready (${elapsed}ms).`);
        return true;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error(`Server at ${url} did not become healthy within ${maxTimeoutMs}ms`);
}

async function runBenchmark(label, baseUrl) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`  Target: ${baseUrl}${ENDPOINT}`);
  console.log(`  Concurrency: ${CONCURRENCY}, Duration: ${DURATION_SECONDS}s`);
  console.log(`${'═'.repeat(60)}\n`);

  await waitForHealthy(baseUrl);

  const results = [];
  const startTime = Date.now();
  const endTime = startTime + DURATION_SECONDS * 1000;

  while (Date.now() < endTime) {
    const batch = await runBatch(baseUrl, CONCURRENCY);
    results.push(...batch);
    // 10ms pacing between batches to avoid event loop starvation
    await new Promise(r => setTimeout(r, 10));
  }

  const totalRequests = results.length;
  const elapsed = (Date.now() - startTime) / 1000;
  const throughput = totalRequests / elapsed;
  const latencies = results.map(r => r.latency);
  const errors = results.filter(r => r.error).length;
  const errorRate = errors / totalRequests;

  const statusCounts = {};
  results.forEach(r => {
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
  });

  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const p99 = percentile(latencies, 99);

  const stdDev = Math.sqrt(
    latencies.reduce((sum, l) => sum + Math.pow(l - (latencies.reduce((a, b) => a + b, 0) / latencies.length), 2), 0) / latencies.length
  );

  console.log(`Total Requests: ${totalRequests}`);
  console.log(`Throughput:     ${throughput.toFixed(2)} req/s`);
  console.log(`Error Rate:     ${(errorRate * 100).toFixed(2)}%`);
  console.log(`P50 Latency:    ${p50.toFixed(2)}ms`);
  console.log(`P95 Latency:    ${p95.toFixed(2)}ms`);
  console.log(`P99 Latency:    ${p99.toFixed(2)}ms`);
  console.log(`Status:         ${JSON.stringify(statusCounts)}`);

  return {
    label,
    totalRequests,
    throughput: parseFloat(throughput.toFixed(2)),
    errorRate: parseFloat((errorRate * 100).toFixed(2)),
    p50: parseFloat(p50.toFixed(2)),
    p95: parseFloat(p95.toFixed(2)),
    p99: parseFloat(p99.toFixed(2)),
    stdDev: parseFloat(stdDev.toFixed(2)),
    statusCounts,
  };
}

async function main() {
  mkdirSync(REPORTS_DIR, { recursive: true });

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  CONTAINERIZED HORIZONTAL SCALING BENCHMARK             ║');
  console.log('║  Real MongoDB + Real Redis + Real NGINX LB              ║');
  console.log('║  Concurrency: 50 | Duration: 15s | Rate-limit: OFF     ║');
  console.log('╚══════════════════════════════════════════════════════════╝');

  // Step 1: Single-instance baseline
  // To get a fair single-instance baseline, the user should run:
  //   docker compose stop app2
  // before running this script, then restart app2 for the dual test.
  // Alternatively, we test both topologies against the same LB endpoint
  // and rely on the user to control the number of backends.

  console.log('\n[Bench] PHASE 1: Single-instance baseline');
  console.log('[Bench] Ensure only app1 is running: docker compose stop app2');
  console.log('[Bench] Press Enter when ready, or wait 5s to auto-continue...');

  // Auto-continue after 5s (non-interactive CI mode)
  await new Promise(r => setTimeout(r, 5000));

  const singleResult = await runBenchmark(
    'Single Instance (1 app behind NGINX)',
    SINGLE_INSTANCE_URL
  );

  console.log('\n[Bench] PHASE 2: Dual-instance with NGINX LB');
  console.log('[Bench] Ensure both app1 + app2 are running: docker compose start app2');
  console.log('[Bench] Press Enter when ready, or wait 10s to auto-continue...');

  await new Promise(r => setTimeout(r, 10000));

  const dualResult = await runBenchmark(
    'Dual Instance (2 apps behind NGINX LB)',
    DUAL_INSTANCE_URL
  );

  // Calculate scaling metrics
  const speedup = dualResult.throughput / singleResult.throughput;
  const efficiency = (speedup / 2) * 100;

  console.log('\n' + '═'.repeat(60));
  console.log('  CONTAINERIZED SCALING RESULTS');
  console.log('═'.repeat(60));
  console.log(`  Single-instance: ${singleResult.throughput} req/s`);
  console.log(`  Dual-instance:   ${dualResult.throughput} req/s`);
  console.log(`  Speedup:         ${speedup.toFixed(2)}x`);
  console.log(`  Efficiency:      ${efficiency.toFixed(2)}%`);
  console.log('═'.repeat(60));

  // Write report
  const timestamp = new Date().toISOString();
  const report = {
    timestamp,
    environment: 'containerized',
    infrastructure: {
      loadBalancer: 'NGINX (nginx:alpine)',
      redis: 'Redis 7 Alpine (real)',
      mongodb: 'MongoDB 7.0 (real)',
      appRuntime: 'Node.js 22 Alpine (Docker)',
    },
    parameters: {
      concurrency: CONCURRENCY,
      durationSeconds: DURATION_SECONDS,
      rateLimiting: 'disabled',
      endpoint: ENDPOINT,
    },
    singleInstance: singleResult,
    dualInstance: dualResult,
    scaling: {
      idealSpeedup: 2.0,
      measuredSpeedup: parseFloat(speedup.toFixed(2)),
      scalingEfficiency: parseFloat(efficiency.toFixed(2)),
    },
    verdict: singleResult.errorRate < 1 && dualResult.errorRate < 1 ? 'PASS' : 'FAIL',
  };

  writeFileSync(
    join(REPORTS_DIR, 'horizontal_scaling_containerized.json'),
    JSON.stringify(report, null, 2)
  );

  // Generate markdown report section
  const md = `## Containerized Benchmark

**Date**: ${timestamp}
**Environment**: Docker Compose (real MongoDB 7.0, real Redis 7 Alpine, NGINX round-robin LB)
**Parameters**: concurrency ${CONCURRENCY}, duration ${DURATION_SECONDS}s, rate-limiting disabled

| Configuration | Avg RPS | StdDev | P50 | P95 | P99 | Error Rate |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|
| Single Instance (1 app behind NGINX) | ${singleResult.throughput} | ±${singleResult.stdDev} | ${singleResult.p50}ms | ${singleResult.p95}ms | ${singleResult.p99}ms | ${singleResult.errorRate}% |
| Dual Instance (2 apps behind NGINX) | ${dualResult.throughput} | ±${dualResult.stdDev} | ${dualResult.p50}ms | ${dualResult.p95}ms | ${dualResult.p99}ms | ${dualResult.errorRate}% |

| Metric | Value |
|:---|:---:|
| Ideal Speedup | 2x |
| **Measured Speedup** | **${speedup.toFixed(2)}x** |
| **Scaling Efficiency** | **${efficiency.toFixed(2)}%** |
`;

  writeFileSync(join(REPORTS_DIR, 'horizontal_scaling_containerized.md'), md);

  console.log(`\n[Bench] Reports written to:`);
  console.log(`  ${join(REPORTS_DIR, 'horizontal_scaling_containerized.json')}`);
  console.log(`  ${join(REPORTS_DIR, 'horizontal_scaling_containerized.md')}`);

  process.exit(report.verdict === 'PASS' ? 0 : 1);
}

main().catch(err => {
  console.error('[Bench] Fatal error:', err.message);
  process.exit(1);
});
