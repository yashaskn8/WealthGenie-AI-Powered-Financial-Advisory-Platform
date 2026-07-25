/**
 * Horizontal Scaling Benchmark — Real Redis
 *
 * Spawns server instances that connect to the real hosted Redis specified
 * by REDIS_URL in .env. The load balancer is scripts/lb-proxy.js (a simple
 * round-robin script). Both app instances run on this same machine.
 *
 * Parameters (matching the original local simulation for comparison):
 *   Concurrency: 50, Duration: 15s per run, 3 runs averaged
 *   Rate-limiting: disabled (DISABLE_RATE_LIMIT=true)
 *   HTTP logging: disabled (DISABLE_HTTP_LOGGING=true)
 *   Endpoint: /health/ready
 *
 * Usage:
 *   cd server && node scripts/run-horizontal-scaling-real-redis.js
 */

import 'dotenv/config';
import { spawn } from 'child_process';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = join(__dirname, '..');
const REPORTS_DIR = join(SERVER_DIR, 'reports');

const CONCURRENCY = 50;
const DURATION_SECONDS = 15;
const NUM_RUNS = 3;
const ENDPOINT = '/health/ready';

// Verify Redis configuration
const redisUrl = process.env.REDIS_URL;
if (!redisUrl || redisUrl.includes('localhost') || redisUrl.includes('127.0.0.1')) {
  console.error('[Bench] ERROR: REDIS_URL must point to a real hosted Redis instance.');
  console.error('[Bench] Current REDIS_URL:', redisUrl || '(not set)');
  console.error('[Bench] Set REDIS_URL in server/.env to a hosted Redis (e.g. Upstash).');
  process.exit(1);
}

// Mask password for logging
const maskedUrl = redisUrl.replace(/:([^@]+)@/, ':****@');
console.log(`[Bench] Redis: ${maskedUrl}`);
console.log(`[Bench] Concurrency: ${CONCURRENCY}, Duration: ${DURATION_SECONDS}s × ${NUM_RUNS} runs`);
console.log(`[Bench] Rate-limiting: disabled, HTTP logging: disabled`);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function spawnServer(port) {
  const env = {
    ...process.env,
    PORT: String(port),
    DISABLE_RATE_LIMIT: 'true',
    DISABLE_HTTP_LOGGING: 'true',
    NODE_ENV: 'production',
  };
  const child = spawn('node', ['server.js'], {
    cwd: SERVER_DIR,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', d => {
    const msg = d.toString().trim();
    // Only log actual errors, not warnings
    if (msg.includes('Error') || msg.includes('error')) {
      console.error(`[Server:${port}] ${msg}`);
    }
  });
  child.stdout.on('data', () => {});
  return child;
}

function spawnProxy(port1, port2, proxyPort) {
  const child = spawn('node', ['scripts/lb-proxy.js', String(port1), String(port2), String(proxyPort)], {
    cwd: SERVER_DIR,
    env: { ...process.env },
    stdio: 'pipe',
  });
  child.stderr.on('data', () => {});
  child.stdout.on('data', () => {});
  return child;
}

async function waitForServer(port, maxWait = 30000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}${ENDPOINT}`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return true;
    } catch {}
    await sleep(1000);
  }
  throw new Error(`Server on port ${port} did not become ready within ${maxWait}ms`);
}

async function singleRequest(baseUrl) {
  const start = performance.now();
  try {
    const res = await fetch(`${baseUrl}${ENDPOINT}`);
    const latency = performance.now() - start;
    return { status: res.status, latency, error: res.status >= 400 };
  } catch {
    const latency = performance.now() - start;
    return { status: 0, latency, error: true };
  }
}

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function calcStats(numbers) {
  if (!numbers.length) return { avg: 0, stdDev: 0, variancePct: 0 };
  const avg = numbers.reduce((a, b) => a + b, 0) / numbers.length;
  const variance = numbers.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / numbers.length;
  const stdDev = Math.sqrt(variance);
  return {
    avg: parseFloat(avg.toFixed(2)),
    stdDev: parseFloat(stdDev.toFixed(2)),
    variancePct: parseFloat((avg > 0 ? (stdDev / avg) * 100 : 0).toFixed(2)),
  };
}

async function runBenchmark(label, baseUrl) {
  console.log(`\n  ${label}: ${baseUrl}${ENDPOINT}`);
  const runResults = [];

  for (let run = 1; run <= NUM_RUNS; run++) {
    const results = [];
    const startTime = Date.now();
    const endTime = startTime + DURATION_SECONDS * 1000;

    while (Date.now() < endTime) {
      const promises = [];
      for (let i = 0; i < CONCURRENCY; i++) {
        promises.push(singleRequest(baseUrl));
      }
      const batch = await Promise.all(promises);
      results.push(...batch);
      await sleep(10);
    }

    const elapsed = (Date.now() - startTime) / 1000;
    const rps = results.length / elapsed;
    const latencies = results.map(r => r.latency);
    const errors = results.filter(r => r.error).length;
    const p95 = percentile(latencies, 95);
    const p99 = percentile(latencies, 99);

    console.log(`    Run ${run}/${NUM_RUNS}: ${rps.toFixed(1)} RPS, P95=${p95.toFixed(1)}ms, P99=${p99.toFixed(1)}ms, errors=${errors}/${results.length}`);
    runResults.push({ rps, p95, p99, errors, totalRequests: results.length });
  }

  const rpsStats = calcStats(runResults.map(r => r.rps));
  const avgP95 = parseFloat((runResults.reduce((a, r) => a + r.p95, 0) / runResults.length).toFixed(2));
  const avgP99 = parseFloat((runResults.reduce((a, r) => a + r.p99, 0) / runResults.length).toFixed(2));
  const totalErrors = runResults.reduce((a, r) => a + r.errors, 0);
  const totalReqs = runResults.reduce((a, r) => a + r.totalRequests, 0);

  return { label, rpsStats, avgP95, avgP99, totalErrors, totalReqs, runs: runResults };
}

async function main() {
  mkdirSync(REPORTS_DIR, { recursive: true });

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  HORIZONTAL SCALING BENCHMARK — REAL REDIS');
  console.log('══════════════════════════════════════════════════════════');

  // Spawn single instance on port 5100
  console.log('\n[Bench] Starting single instance on port 5100...');
  const sSingle = spawnServer(5100);
  await waitForServer(5100);
  console.log('[Bench] Single instance ready.');

  // Spawn dual instances on 5101 + 5102, proxy on 5103
  console.log('[Bench] Starting dual instances on 5101, 5102 + lb-proxy on 5103...');
  const s1 = spawnServer(5101);
  const s2 = spawnServer(5102);
  await waitForServer(5101);
  await waitForServer(5102);
  const proxy = spawnProxy(5101, 5102, 5103);
  await sleep(1500);
  await waitForServer(5103);
  console.log('[Bench] Dual instances + proxy ready.');

  // Run benchmarks
  const singleResult = await runBenchmark('Single Instance (port 5100)', 'http://127.0.0.1:5100');
  const dualResult = await runBenchmark('Dual Instance + LB (port 5103)', 'http://127.0.0.1:5103');

  // Cleanup
  for (const p of [sSingle, s1, s2, proxy]) {
    try { p.kill(); } catch {}
  }

  // Calculate scaling
  const speedup = singleResult.rpsStats.avg > 0
    ? parseFloat((dualResult.rpsStats.avg / singleResult.rpsStats.avg).toFixed(2))
    : 1.0;
  const efficiency = parseFloat(((speedup / 2) * 100).toFixed(2));

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  RESULTS');
  console.log('══════════════════════════════════════════════════════════');
  console.log(`  Single: ${singleResult.rpsStats.avg} ± ${singleResult.rpsStats.stdDev} RPS, P95=${singleResult.avgP95}ms, P99=${singleResult.avgP99}ms`);
  console.log(`  Dual:   ${dualResult.rpsStats.avg} ± ${dualResult.rpsStats.stdDev} RPS, P95=${dualResult.avgP95}ms, P99=${dualResult.avgP99}ms`);
  console.log(`  Speedup: ${speedup}x, Efficiency: ${efficiency}%`);
  console.log('══════════════════════════════════════════════════════════\n');

  // Write JSON
  const jsonReport = {
    timestamp: new Date().toISOString(),
    redis: maskedUrl,
    loadBalancer: 'scripts/lb-proxy.js (round-robin)',
    sameHost: true,
    parameters: { concurrency: CONCURRENCY, durationSeconds: DURATION_SECONDS, runs: NUM_RUNS, rateLimiting: 'disabled', endpoint: ENDPOINT },
    single: singleResult,
    dual: dualResult,
    scaling: { idealSpeedup: 2.0, measuredSpeedup: speedup, efficiencyPercent: efficiency },
  };
  writeFileSync(join(REPORTS_DIR, 'horizontal_scaling.json'), JSON.stringify(jsonReport, null, 2));

  // Write Markdown report — preserve old numbers, add new
  const md = `# Horizontal Scaling Benchmark

## Real Redis benchmark (no Docker)

**Date**: ${jsonReport.timestamp}
**Methodology**:
- Both app instances connected to a real hosted Redis (Upstash) specified by REDIS_URL in .env.
- The load balancer is \`scripts/lb-proxy.js\`, a simple round-robin HTTP proxy script — not NGINX, HAProxy, or any production load balancer.
- Both app instances ran as local Node.js processes on the same physical machine, not separate hosts.
- The only change from the original simulation is that Redis is now real. The load balancer and execution topology are unchanged.

**Parameters**: concurrency ${CONCURRENCY}, duration ${DURATION_SECONDS}s × ${NUM_RUNS} runs averaged, rate-limiting disabled, endpoint \`${ENDPOINT}\`

| Configuration | Avg RPS ± StdDev | P95 Latency | P99 Latency | Variance % |
|:---|:---:|:---:|:---:|:---:|
| Single Instance (port 5100) | ${singleResult.rpsStats.avg} ± ${singleResult.rpsStats.stdDev} | ${singleResult.avgP95} ms | ${singleResult.avgP99} ms | ${singleResult.rpsStats.variancePct}% |
| Dual Instance + LB (port 5103) | ${dualResult.rpsStats.avg} ± ${dualResult.rpsStats.stdDev} | ${dualResult.avgP95} ms | ${dualResult.avgP99} ms | ${dualResult.rpsStats.variancePct}% |

| Metric | Value |
|:---|:---:|
| Ideal Speedup | 2x |
| **Measured Speedup** | **${speedup}x** |
| **Scaling Efficiency** | **${efficiency}%** |

---

## Local simulation (original, superseded)

> This earlier benchmark used \`scripts/redis-emulator.js\` (an in-memory fake Redis) instead of a real Redis instance. It validated that the application code is stateless, but the Redis behavior was not representative. The numbers below are retained for comparison.

**Date**: 2026-07-24T18:06:46.336Z
**Parameters**: concurrency 50, duration 15s, rate-limiting disabled on both topologies

| Configuration | Avg RPS ± StdDev | P95 Latency | P99 Latency | Variance % |
|:---|:---:|:---:|:---:|:---:|
| Single Instance (port 5100) | 191.43 ± 21.51 | 0.00 ms | 618.00 ms | 11.24% |
| Dual Instance + LB (port 5103) | 291.78 ± 15.49 | 0.00 ms | 317.00 ms | 5.31% |

| Metric | Value |
|:---|:---:|
| Ideal Speedup | 2x |
| Measured Speedup | 1.52x |
| Scaling Efficiency | 76.21% |
`;

  writeFileSync(join(REPORTS_DIR, 'horizontal_scaling.md'), md);

  console.log('[Bench] Reports written:');
  console.log(`  ${join(REPORTS_DIR, 'horizontal_scaling.json')}`);
  console.log(`  ${join(REPORTS_DIR, 'horizontal_scaling.md')}`);

  process.exit(0);
}

main().catch(err => {
  console.error('[Bench] Fatal:', err.message);
  process.exit(1);
});
