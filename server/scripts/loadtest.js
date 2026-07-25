/**
 * Load Test Suite — npm run loadtest
 *
 * Automated performance benchmark that exercises the health endpoint
 * under concurrent load and validates against defined thresholds.
 *
 * Thresholds:
 *   - P95 latency < 500ms
 *   - Error rate < 1%
 *   - Throughput reported in req/sec
 *
 * Output: reports/loadtest.json, reports/loadtest.md
 */

import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = join(__dirname, '..', 'reports');

const BASE_URL = process.env.LOADTEST_URL || 'http://127.0.0.1:5000';
const CONCURRENT_USERS = parseInt(process.env.LOADTEST_USERS || '100', 10);
const DURATION_SECONDS = parseInt(process.env.LOADTEST_DURATION || '10', 10);
const ENDPOINT = '/health/ready';

// Thresholds
const P95_THRESHOLD_MS = 500;
const ERROR_RATE_THRESHOLD = 0.01; // 1%

async function singleRequest() {
  const start = performance.now();
  try {
    const res = await fetch(`${BASE_URL}${ENDPOINT}`);
    const latency = performance.now() - start;
    return { status: res.status, latency, error: res.status >= 500 };
  } catch (err) {
    const latency = performance.now() - start;
    return { status: 0, latency, error: true, message: err.message };
  }
}

async function runBatch(batchSize) {
  const promises = [];
  for (let i = 0; i < batchSize; i++) {
    promises.push(singleRequest());
  }
  return Promise.all(promises);
}

function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function waitForHealthy(url, maxTimeoutMs = 15000) {
  const start = Date.now();
  console.log(`[LoadTest] Polling server readiness at ${url}...`);
  while (Date.now() - start < maxTimeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        console.log(`[LoadTest] Server is healthy and ready at ${url} (${Date.now() - start}ms).`);
        return true;
      }
    } catch (_) {}
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error(`[LoadTest] Server readiness timeout at ${url} after ${maxTimeoutMs}ms`);
}

async function ensureServerRunning() {
  process.env.DISABLE_HTTP_LOGGING = 'true';
  process.env.DISABLE_RATE_LIMIT = 'true';
  try {
    const res = await fetch(`${BASE_URL}${ENDPOINT}`);
    if (res.ok) return null; // Server already running
  } catch (_) {}

  // Server not running on BASE_URL — start server in-process via start()
  await import('../server.js');
  await waitForHealthy(`${BASE_URL}${ENDPOINT}`, 15000);
  return null;
}

async function main() {
  process.env.DISABLE_HTTP_LOGGING = 'true';
  process.env.DISABLE_RATE_LIMIT = 'true';
  mkdirSync(REPORTS_DIR, { recursive: true });
  const spawnedServer = await ensureServerRunning();

  console.log(`\n╔══════════════════════════════════════════════════════════╗`);
  console.log(`║  LOAD TEST — Performance Benchmark                     ║`);
  console.log(`╠══════════════════════════════════════════════════════════╣`);
  console.log(`║  Target: ${BASE_URL}${ENDPOINT}`);
  console.log(`║  Concurrent Users: ${CONCURRENT_USERS}`);
  console.log(`║  Duration: ${DURATION_SECONDS}s`);
  console.log(`╚══════════════════════════════════════════════════════════╝\n`);

  const allResults = [];
  const startTime = Date.now();

  while ((Date.now() - startTime) < DURATION_SECONDS * 1000) {
    const batch = await runBatch(CONCURRENT_USERS);
    allResults.push(...batch);
    await new Promise(r => setTimeout(r, 10));
  }

  const totalRequests = allResults.length;
  const statusCounts = {};
  for (const r of allResults) {
    statusCounts[r.status] = (statusCounts[r.status] || 0) + 1;
  }

  const errors = allResults.filter(r => r.error).length;
  const errorRate = errors / totalRequests;
  const latencies = allResults.map(r => r.latency);

  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const p99 = percentile(latencies, 99);
  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const min = Math.min(...latencies);
  const max = Math.max(...latencies);

  const elapsedSeconds = (Date.now() - startTime) / 1000;
  const throughput = totalRequests / elapsedSeconds;

  const p95Pass = p95 < P95_THRESHOLD_MS;
  const errorPass = errorRate < ERROR_RATE_THRESHOLD;
  const overallPass = p95Pass && errorPass;

  const report = {
    timestamp: new Date().toISOString(),
    config: {
      baseUrl: BASE_URL,
      endpoint: ENDPOINT,
      concurrentUsers: CONCURRENT_USERS,
      durationSeconds: DURATION_SECONDS,
    },
    results: {
      totalRequests,
      statusCounts,
      errors,
      errorRate: parseFloat((errorRate * 100).toFixed(2)),
      throughput: parseFloat(throughput.toFixed(2)),
      latency: {
        min: parseFloat(min.toFixed(2)),
        avg: parseFloat(avg.toFixed(2)),
        p50: parseFloat(p50.toFixed(2)),
        p95: parseFloat(p95.toFixed(2)),
        p99: parseFloat(p99.toFixed(2)),
        max: parseFloat(max.toFixed(2)),
      },
    },
    thresholds: {
      p95: { threshold: P95_THRESHOLD_MS, actual: parseFloat(p95.toFixed(2)), pass: p95Pass },
      errorRate: { threshold: `${ERROR_RATE_THRESHOLD * 100}%`, actual: `${(errorRate * 100).toFixed(2)}%`, pass: errorPass },
    },
    verdict: overallPass ? 'PASS' : 'FAIL',
  };

  // Write JSON report
  writeFileSync(join(REPORTS_DIR, 'loadtest.json'), JSON.stringify(report, null, 2));

  // Write Markdown report
  const md = `# Load Test Report

**Date**: ${report.timestamp}
**Endpoint**: \`${BASE_URL}${ENDPOINT}\`
**Concurrent Users**: ${CONCURRENT_USERS}
**Duration**: ${DURATION_SECONDS}s

## Results

| Metric | Value |
|:---|:---|
| Total Requests | ${totalRequests} |
| Errors | ${errors} |
| Error Rate | ${(errorRate * 100).toFixed(2)}% |
| Throughput | ${throughput.toFixed(2)} req/s |

## Latency Distribution

| Percentile | Latency (ms) |
|:---|:---|
| Min | ${min.toFixed(2)} |
| P50 | ${p50.toFixed(2)} |
| P95 | ${p95.toFixed(2)} |
| P99 | ${p99.toFixed(2)} |
| Max | ${max.toFixed(2)} |

## Threshold Checks

| Threshold | Target | Actual | Status |
|:---|:---|:---|:---|
| P95 Latency | < ${P95_THRESHOLD_MS}ms | ${p95.toFixed(2)}ms | ${p95Pass ? '✅ PASS' : '❌ FAIL'} |
| Error Rate | < ${ERROR_RATE_THRESHOLD * 100}% | ${(errorRate * 100).toFixed(2)}% | ${errorPass ? '✅ PASS' : '❌ FAIL'} |

## Verdict: **${report.verdict}**
`;

  writeFileSync(join(REPORTS_DIR, 'loadtest.md'), md);

  // Generate SVG badge
  const svgBadge = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="20">
  <linearGradient id="b" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <mask id="a">
    <rect width="180" height="20" rx="3" fill="#fff"/>
  </mask>
  <g mask="url(#a)">
    <path fill="#555" d="0 0 90 20"/>
    <path fill="${overallPass ? '#4c1' : '#e05d44'}" d="M90 0 h90 v20 H90 z"/>
    <path fill="url(#b)" d="0 0 180 20"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11">
    <text x="45" y="15" fill="#010101" fill-opacity=".3">loadtest</text>
    <text x="45" y="14">loadtest</text>
    <text x="135" y="15" fill="#010101" fill-opacity=".3">${overallPass ? 'passing' : 'failing'}</text>
    <text x="135" y="14">${overallPass ? 'passing' : 'failing'}</text>
  </g>
</svg>`;

  writeFileSync(join(REPORTS_DIR, 'loadtest.svg'), svgBadge);

  // Console output
  console.log(`Total Requests: ${totalRequests}`);
  console.log(`Throughput:     ${throughput.toFixed(2)} req/s`);
  console.log(`Error Rate:     ${(errorRate * 100).toFixed(2)}%`);
  console.log(`P50 Latency:    ${p50.toFixed(2)}ms`);
  console.log(`P95 Latency:    ${p95.toFixed(2)}ms`);
  console.log(`P99 Latency:    ${p99.toFixed(2)}ms`);
  console.log(`Status Breakdown:`, JSON.stringify(statusCounts));
  console.log(`\nVerdict: ${report.verdict}`);

  if (spawnedServer) {
    await new Promise(resolve => spawnedServer.close(resolve));
  }

  process.exit(overallPass ? 0 : 1);
}

main().catch(err => {
  console.error('Load test failed:', err);
  process.exit(1);
});
