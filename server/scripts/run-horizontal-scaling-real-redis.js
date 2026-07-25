/**
 * Horizontal Scaling Benchmark — Real Redis, /api/goals endpoint
 *
 * Tests the same endpoint as verify-scalability-zero-trust.js (/api/goals)
 * so results are directly comparable to the original 1.52x number.
 *
 * Three configurations tested:
 *   1. Single instance, no proxy (direct baseline)
 *   2. Single instance, through lb-proxy.js (isolates proxy overhead)
 *   3. Dual instance, through lb-proxy.js (measures parallelism benefit)
 *
 * All instances connect to real hosted Redis via REDIS_URL from .env.
 * lb-proxy.js now uses HTTP keep-alive (maxSockets=256).
 *
 * Parameters: concurrency 50, duration 15s, 3 runs averaged, rate-limiting disabled.
 */

import 'dotenv/config';
import { spawn } from 'child_process';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = join(__dirname, '..');
const REPORTS_DIR = join(SERVER_DIR, 'reports');

const CONCURRENCY = 50;
const DURATION_SECONDS = 15;
const NUM_RUNS = 3;
const ENDPOINT = '/api/goals';

// JWT for authenticated endpoint
const JWT_SECRET = process.env.JWT_SECRET || 'bench-jwt-secret-key-12345';
const TEST_USER_ID = new mongoose.Types.ObjectId().toString();
const TEST_TOKEN = jwt.sign(
  { userId: TEST_USER_ID, email: 'bench@wealthgenie.test', role: 'user' },
  JWT_SECRET,
  { expiresIn: '24h' }
);

// Verify Redis configuration
const redisUrl = process.env.REDIS_URL;
if (!redisUrl || redisUrl.includes('localhost') || redisUrl.includes('127.0.0.1')) {
  console.error('[Bench] REDIS_URL must point to a real hosted Redis instance.');
  console.error('[Bench] Current REDIS_URL:', redisUrl || '(not set)');
  process.exit(1);
}
const maskedUrl = redisUrl.replace(/:([^@]+)@/, ':****@');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function spawnServer(port) {
  const env = {
    ...process.env,
    PORT: String(port),
    DISABLE_RATE_LIMIT: 'true',
    DISABLE_HTTP_LOGGING: 'true',
    JWT_SECRET,
    NODE_ENV: 'production',
  };
  const child = spawn('node', ['server.js'], {
    cwd: SERVER_DIR, env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', d => {
    const msg = d.toString().trim();
    if (msg.includes('Error') || msg.includes('EADDRINUSE')) {
      console.error(`[Server:${port}] ${msg}`);
    }
  });
  child.stdout.on('data', () => {});
  return child;
}

function spawnProxy(port1, port2, proxyPort) {
  const child = spawn('node', ['scripts/lb-proxy.js', String(port1), String(port2), String(proxyPort)], {
    cwd: SERVER_DIR, env: { ...process.env },
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
      const res = await fetch(`http://127.0.0.1:${port}/health/ready`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return true;
    } catch {}
    await sleep(1000);
  }
  throw new Error(`Server on port ${port} did not become ready within ${maxWait}ms`);
}

async function singleRequest(baseUrl) {
  const start = performance.now();
  try {
    const res = await fetch(`${baseUrl}${ENDPOINT}`, {
      headers: { authorization: `Bearer ${TEST_TOKEN}` },
    });
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
  console.log(`\n  ${label}`);
  console.log(`  Target: ${baseUrl}${ENDPOINT}`);
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
  console.log('  HORIZONTAL SCALING BENCHMARK — REAL REDIS, /api/goals');
  console.log('══════════════════════════════════════════════════════════');
  console.log(`  Redis:       ${maskedUrl}`);
  console.log(`  Endpoint:    ${ENDPOINT} (JWT-authenticated)`);
  console.log(`  Concurrency: ${CONCURRENCY}, Duration: ${DURATION_SECONDS}s × ${NUM_RUNS} runs`);
  console.log(`  Rate-limit:  disabled, HTTP logging: disabled`);
  console.log(`  lb-proxy.js: keep-alive enabled (maxSockets=256)`);

  // --- Configuration 1: Single instance, no proxy (port 5100) ---
  console.log('\n[Bench] Starting single instance on port 5100...');
  const sSingle = spawnServer(5100);
  await waitForServer(5100);

  const resultDirect = await runBenchmark(
    'Config 1: Single instance, no proxy (port 5100)',
    'http://127.0.0.1:5100'
  );

  // --- Configuration 2: Single instance, through proxy ---
  // Proxy on 5103 pointing to 5100 + 5100 (same backend twice = round-robin to self)
  console.log('\n[Bench] Starting lb-proxy on 5103 → single backend 5100...');
  const proxySingle = spawnProxy(5100, 5100, 5103);
  await sleep(1500);
  await waitForServer(5103);

  const resultProxySingle = await runBenchmark(
    'Config 2: Single instance, through lb-proxy (port 5103 → 5100)',
    'http://127.0.0.1:5103'
  );

  proxySingle.kill();
  await sleep(500);

  // --- Configuration 3: Dual instance, through proxy ---
  console.log('\n[Bench] Starting second instance on port 5101...');
  const s2 = spawnServer(5101);
  await waitForServer(5101);

  console.log('[Bench] Starting lb-proxy on 5103 → 5100 + 5101...');
  const proxyDual = spawnProxy(5100, 5101, 5103);
  await sleep(1500);
  await waitForServer(5103);

  const resultProxyDual = await runBenchmark(
    'Config 3: Dual instance, through lb-proxy (port 5103 → 5100+5101)',
    'http://127.0.0.1:5103'
  );

  // Cleanup
  for (const p of [sSingle, s2, proxyDual]) {
    try { p.kill(); } catch {}
  }

  // Calculate scaling metrics
  const proxyOverhead = resultDirect.rpsStats.avg > 0
    ? parseFloat((resultProxySingle.rpsStats.avg / resultDirect.rpsStats.avg).toFixed(2))
    : 1.0;
  const dualVsDirect = resultDirect.rpsStats.avg > 0
    ? parseFloat((resultProxyDual.rpsStats.avg / resultDirect.rpsStats.avg).toFixed(2))
    : 1.0;
  const dualVsProxySingle = resultProxySingle.rpsStats.avg > 0
    ? parseFloat((resultProxyDual.rpsStats.avg / resultProxySingle.rpsStats.avg).toFixed(2))
    : 1.0;
  const efficiency = parseFloat(((dualVsProxySingle / 2) * 100).toFixed(2));

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  RESULTS');
  console.log('══════════════════════════════════════════════════════════');
  console.log(`  Direct:        ${resultDirect.rpsStats.avg} ± ${resultDirect.rpsStats.stdDev} RPS`);
  console.log(`  Via proxy (1): ${resultProxySingle.rpsStats.avg} ± ${resultProxySingle.rpsStats.stdDev} RPS  (${proxyOverhead}x of direct)`);
  console.log(`  Via proxy (2): ${resultProxyDual.rpsStats.avg} ± ${resultProxyDual.rpsStats.stdDev} RPS  (${dualVsDirect}x of direct, ${dualVsProxySingle}x of proxied-single)`);
  console.log(`  Proxy overhead:       ${proxyOverhead}x (ratio of proxied-single to direct)`);
  console.log(`  Scaling efficiency:   ${efficiency}% (dual-proxied / single-proxied, ideal=2x → 100%)`);
  console.log('══════════════════════════════════════════════════════════\n');

  // Write JSON
  const jsonReport = {
    timestamp: new Date().toISOString(),
    redis: maskedUrl,
    loadBalancer: 'scripts/lb-proxy.js (round-robin, keep-alive enabled)',
    sameHost: true,
    endpoint: ENDPOINT,
    parameters: { concurrency: CONCURRENCY, durationSeconds: DURATION_SECONDS, runs: NUM_RUNS, rateLimiting: 'disabled' },
    configs: {
      directSingle: resultDirect,
      proxiedSingle: resultProxySingle,
      proxiedDual: resultProxyDual,
    },
    scaling: {
      proxyOverhead,
      dualVsDirect,
      dualVsProxySingle,
      efficiencyPercent: efficiency,
    },
  };
  writeFileSync(join(REPORTS_DIR, 'horizontal_scaling.json'), JSON.stringify(jsonReport, null, 2));

  // Read existing report to preserve previous sections
  const existingReport = existsSync(join(REPORTS_DIR, 'horizontal_scaling.md'))
    ? readFileSync(join(REPORTS_DIR, 'horizontal_scaling.md'), 'utf-8')
    : '';

  const newSection = `## Real Redis benchmark — /api/goals, keep-alive proxy (current)

**Date**: ${jsonReport.timestamp}

**What changed from previous run**:
- **Endpoint**: now \`/api/goals\` (JWT-authenticated, hits MongoDB) instead of \`/health/ready\`. This matches the endpoint used in the original \`verify-scalability-zero-trust.js\` benchmark, making the comparison fair.
- **lb-proxy.js fix**: added HTTP keep-alive agent (maxSockets=256). Previously every proxied request opened a new TCP connection.
- **Third configuration added**: single instance through proxy, to isolate proxy overhead from scaling benefit.

**Methodology**:
- All instances connected to real hosted Redis (Upstash) via REDIS_URL.
- Load balancer: \`scripts/lb-proxy.js\` (round-robin, now with keep-alive).
- All processes ran on the same physical machine (not separate hosts).
- Rate-limiting disabled, HTTP logging disabled.

**Parameters**: concurrency ${CONCURRENCY}, duration ${DURATION_SECONDS}s × ${NUM_RUNS} runs averaged

| Configuration | Avg RPS ± StdDev | P95 Latency | P99 Latency | Variance % |
|:---|:---:|:---:|:---:|:---:|
| Single instance, no proxy (port 5100) | ${resultDirect.rpsStats.avg} ± ${resultDirect.rpsStats.stdDev} | ${resultDirect.avgP95} ms | ${resultDirect.avgP99} ms | ${resultDirect.rpsStats.variancePct}% |
| Single instance, through proxy (port 5103 → 5100) | ${resultProxySingle.rpsStats.avg} ± ${resultProxySingle.rpsStats.stdDev} | ${resultProxySingle.avgP95} ms | ${resultProxySingle.avgP99} ms | ${resultProxySingle.rpsStats.variancePct}% |
| Dual instance, through proxy (port 5103 → 5100+5101) | ${resultProxyDual.rpsStats.avg} ± ${resultProxyDual.rpsStats.stdDev} | ${resultProxyDual.avgP95} ms | ${resultProxyDual.avgP99} ms | ${resultProxyDual.rpsStats.variancePct}% |

| Metric | Value |
|:---|:---:|
| Proxy overhead (proxied-single / direct) | ${proxyOverhead}x |
| Dual-proxied / direct | ${dualVsDirect}x |
| **Dual-proxied / proxied-single** | **${dualVsProxySingle}x** |
| **Scaling efficiency** | **${efficiency}%** |
`;

  const fullReport = `# Horizontal Scaling Benchmark

${newSection}
---

${existingReport.replace(/^# Horizontal Scaling Benchmark\n*/, '')}`;

  writeFileSync(join(REPORTS_DIR, 'horizontal_scaling.md'), fullReport);

  console.log('[Bench] Reports written to server/reports/');
  process.exit(0);
}

main().catch(err => {
  console.error('[Bench] Fatal:', err.message);
  process.exit(1);
});
