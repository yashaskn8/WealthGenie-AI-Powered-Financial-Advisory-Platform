/**
 * Production Scalability Benchmark Suite — Task 1
 * 
 * Uses `autocannon` to execute multi-concurrency load tests (10, 100, 500)
 * across /api/recommend, /api/portfolio, /api/goals.
 * 
 * Collects: RPS, throughput, latency (avg, min, max, p50, p95, p99),
 * error %, timeout %, CPU %, memory (MB), and event-loop delay (ms).
 * 
 * Reports saved to:
 *   - server/reports/loadtest_results.md
 *   - server/reports/loadtest_results.json
 *   - server/reports/loadtest_results.csv
 *   - server/reports/loadtest_results.svg
 */

import autocannon from 'autocannon';
import jwt from 'jsonwebtoken';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { monitorEventLoopDelay } from 'perf_hooks';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = join(__dirname, '..');
const REPORTS_DIR = join(SERVER_DIR, 'reports');

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-12345';
process.env.JWT_SECRET = JWT_SECRET;
process.env.DISABLE_RATE_LIMIT = 'true';

const TARGET_PORT = process.env.PORT || '5000';
const BASE_URL = `http://127.0.0.1:${TARGET_PORT}`;

const TEST_USER_ID = new mongoose.Types.ObjectId().toString();
const TEST_TOKEN = jwt.sign({ userId: TEST_USER_ID, email: 'bench@wealthgenie.test', role: 'user' }, JWT_SECRET, { expiresIn: '24h' });

const CONCURRENCY_LEVELS = [10, 100, 500];
const DURATION = 30; // 30s per run as required
const WARMUP_DURATION = 5; // 5s warm-up
const NUM_RUNS = 3;

const ENDPOINTS = [
  { path: '/api/goals', method: 'GET' },
  { path: '/api/portfolio', method: 'GET' },
  {
    path: '/api/recommend',
    method: 'POST',
    body: JSON.stringify({
      age: 32,
      annual_income: 1800000,
      monthly_expenses: 60000,
      risk_tolerance: 'Moderate',
      investment_horizon_years: 10,
    }),
    headers: { 'content-type': 'application/json' },
  },
];

async function ensureServerReady() {
  try {
    const res = await fetch(`${BASE_URL}/health/ready`);
    if (res.ok) return null;
  } catch (_) {}

  console.log(`Starting in-process Express server on port ${TARGET_PORT}...`);
  const { default: app } = await import('../server.js');
  return app;
}

async function runAutocannon(opts) {
  return new Promise((resolve, reject) => {
    autocannon(opts, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

function calculateStats(numbers) {
  if (!numbers.length) return { avg: 0, stdDev: 0, min: 0, max: 0 };
  const avg = numbers.reduce((a, b) => a + b, 0) / numbers.length;
  const variance = numbers.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / numbers.length;
  const stdDev = Math.sqrt(variance);
  return {
    avg: parseFloat(avg.toFixed(2)),
    stdDev: parseFloat(stdDev.toFixed(2)),
    min: parseFloat(Math.min(...numbers).toFixed(2)),
    max: parseFloat(Math.max(...numbers).toFixed(2)),
  };
}

async function benchmark() {
  mkdirSync(REPORTS_DIR, { recursive: true });
  await ensureServerReady();

  console.log(`\n╔══════════════════════════════════════════════════════════╗`);
  console.log(`║  TASK 1 — REAL LOAD TEST (PRODUCTION BENCHMARK)         ║`);
  console.log(`╠══════════════════════════════════════════════════════════╣`);
  console.log(`║  Target: ${BASE_URL}`);
  console.log(`║  Concurrency Levels: ${CONCURRENCY_LEVELS.join(', ')}`);
  console.log(`║  Duration: ${DURATION}s per run (${NUM_RUNS} runs per level)`);
  console.log(`╚══════════════════════════════════════════════════════════╝\n`);

  const allBenchmarkResults = [];

  for (const concurrency of CONCURRENCY_LEVELS) {
    for (const ep of ENDPOINTS) {
      console.log(`▶ Benchmarking ${ep.method} ${ep.path} @ ${concurrency} concurrent connections...`);

      const headers = {
        authorization: `Bearer ${TEST_TOKEN}`,
        ...(ep.headers || {}),
      };

      // Warm-up run
      console.log(`  [Warm-up] ${WARMUP_DURATION}s...`);
      await runAutocannon({
        url: `${BASE_URL}${ep.path}`,
        method: ep.method,
        headers,
        body: ep.body,
        connections: Math.min(concurrency, 10),
        duration: WARMUP_DURATION,
      });

      const runResults = [];

      for (let run = 1; run <= NUM_RUNS; run++) {
        console.log(`  [Measured Run ${run}/${NUM_RUNS}] ${DURATION}s...`);

        const histogram = monitorEventLoopDelay();
        histogram.enable();
        const startCpu = process.cpuUsage();
        const startMem = process.memoryUsage();

        const result = await runAutocannon({
          url: `${BASE_URL}${ep.path}`,
          method: ep.method,
          headers,
          body: ep.body,
          connections: concurrency,
          duration: DURATION,
        });

        const elapsedCpu = process.cpuUsage(startCpu);
        const endMem = process.memoryUsage();
        histogram.disable();

        const totalCpuMicros = elapsedCpu.user + elapsedCpu.system;
        const totalCpuPercent = parseFloat(((totalCpuMicros / (DURATION * 1000000)) * 100).toFixed(2));
        const memoryUsedMb = parseFloat(((endMem.heapUsed - startMem.heapUsed) / (1024 * 1024)).toFixed(2));
        const eventLoopDelayMs = parseFloat((histogram.mean / 1000000).toFixed(2));

        const rps = result.requests.average || 0;
        const throughputMbSec = parseFloat(((result.throughput.average || 0) / (1024 * 1024)).toFixed(2));
        const errors = result.errors || 0;
        const timeouts = result.timeouts || 0;
        const totalReqs = result.requests.total || 1;
        const errorPct = parseFloat(((errors / totalReqs) * 100).toFixed(2));
        const timeoutPct = parseFloat(((timeouts / totalReqs) * 100).toFixed(2));

        runResults.push({
          run,
          rps,
          throughputMbSec,
          avgLatency: result.latency.average || 0,
          p50: result.latency.p50 || 0,
          p95: result.latency.p95 || 0,
          p99: result.latency.p99 || 0,
          maxLatency: result.latency.max || 0,
          minLatency: result.latency.min || 0,
          errors,
          timeouts,
          errorPct,
          timeoutPct,
          cpuPercent: totalCpuPercent,
          memoryMb: Math.max(0, memoryUsedMb),
          eventLoopDelayMs,
        });
      }

      const rpsStats = calculateStats(runResults.map(r => r.rps));
      const p95Stats = calculateStats(runResults.map(r => r.p95));
      const p99Stats = calculateStats(runResults.map(r => r.p99));

      const summary = {
        endpoint: ep.path,
        method: ep.method,
        concurrency,
        runs: runResults,
        aggregate: {
          rps: rpsStats,
          p95Latency: p95Stats,
          p99Latency: p99Stats,
          avgThroughputMbSec: calculateStats(runResults.map(r => r.throughputMbSec)).avg,
          avgErrorPct: calculateStats(runResults.map(r => r.errorPct)).avg,
          avgTimeoutPct: calculateStats(runResults.map(r => r.timeoutPct)).avg,
          avgCpuPercent: calculateStats(runResults.map(r => r.cpuPercent)).avg,
          avgEventLoopDelayMs: calculateStats(runResults.map(r => r.eventLoopDelayMs)).avg,
        },
      };

      allBenchmarkResults.push(summary);

      console.log(`  ✔ Complete: RPS=${rpsStats.avg} | P95=${p95Stats.avg}ms | P99=${p99Stats.avg}ms | Error%=${summary.aggregate.avgErrorPct}%\n`);
    }
  }

  // Save JSON
  writeFileSync(join(REPORTS_DIR, 'loadtest_results.json'), JSON.stringify(allBenchmarkResults, null, 2));

  // Save CSV
  let csv = 'Endpoint,Method,Concurrency,Run,RPS,Throughput_MBs,AvgLatency_ms,P50_ms,P95_ms,P99_ms,MaxLatency_ms,Error_Pct,Timeout_Pct,CPU_Pct,EventLoopDelay_ms\n';
  for (const b of allBenchmarkResults) {
    for (const r of b.runs) {
      csv += `${b.endpoint},${b.method},${b.concurrency},${r.run},${r.rps},${r.throughputMbSec},${r.avgLatency},${r.p50},${r.p95},${r.p99},${r.maxLatency},${r.errorPct},${r.timeoutPct},${r.cpuPercent},${r.eventLoopDelayMs}\n`;
    }
  }
  writeFileSync(join(REPORTS_DIR, 'loadtest_results.csv'), csv);

  // Save Markdown
  let md = `# Production Load Test Benchmark Results — Task 1

**Date**: ${new Date().toISOString()}  
**Target Server**: \`${BASE_URL}\`  
**Warm-up**: ${WARMUP_DURATION}s per endpoint | **Runs**: ${NUM_RUNS} × ${DURATION}s per concurrency level

## Summary Table

| Endpoint | Method | Concurrency | RPS (Avg ± StdDev) | P50 (ms) | P95 (ms) | P99 (ms) | Throughput (MB/s) | Error % | CPU % | Event Loop (ms) |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
`;

  for (const b of allBenchmarkResults) {
    const rps = `${b.aggregate.rps.avg} ± ${b.aggregate.rps.stdDev}`;
    const p50 = b.runs[0].p50;
    const p95 = b.aggregate.p95Latency.avg;
    const p99 = b.aggregate.p99Latency.avg;
    md += `| \`${b.endpoint}\` | ${b.method} | ${b.concurrency} | ${rps} | ${p50} | ${p95} | ${p99} | ${b.aggregate.avgThroughputMbSec} | ${b.aggregate.avgErrorPct}% | ${b.aggregate.avgCpuPercent}% | ${b.aggregate.avgEventLoopDelayMs} |\n`;
  }

  md += `\n## Raw Measured Runs Details\n\n`;
  for (const b of allBenchmarkResults) {
    md += `### \`${b.method} ${b.endpoint}\` @ ${b.concurrency} Concurrency\n\n`;
    md += `| Run | RPS | P50 (ms) | P95 (ms) | P99 (ms) | Max (ms) | Error % | CPU % | Event Loop Delay (ms) |\n`;
    md += `|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|\n`;
    for (const r of b.runs) {
      md += `| Run ${r.run} | ${r.rps} | ${r.p50} | ${r.p95} | ${r.p99} | ${r.maxLatency} | ${r.errorPct}% | ${r.cpuPercent}% | ${r.eventLoopDelayMs} |\n`;
    }
    md += `\n`;
  }

  writeFileSync(join(REPORTS_DIR, 'loadtest_results.md'), md);

  // Save SVG Badge
  const overallRps = calculateStats(allBenchmarkResults.map(b => b.aggregate.rps.avg)).avg;
  const overallP95 = calculateStats(allBenchmarkResults.map(b => b.aggregate.p95Latency.avg)).avg;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="20">
  <linearGradient id="b" x2="0" y2="100%"><stop offset="0" stop-color="#bbb" stop-opacity=".1"/><stop offset="1" stop-opacity=".1"/></linearGradient>
  <mask id="a"><rect width="260" height="20" rx="3" fill="#fff"/></mask>
  <g mask="url(#a)">
    <path fill="#555" d="M0 0h130v20H0z"/>
    <path fill="#4c1" d="M130 0h130v20H130z"/>
    <path fill="url(#b)" d="M0 0h260v20H0z"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11">
    <text x="65" y="15" fill="#010101" fill-opacity=".3">loadtest benchmark</text>
    <text x="65" y="14">loadtest benchmark</text>
    <text x="195" y="15" fill="#010101" fill-opacity=".3">${overallRps} RPS | P95 ${overallP95}ms</text>
    <text x="195" y="14">${overallRps} RPS | P95 ${overallP95}ms</text>
  </g>
</svg>`;

  writeFileSync(join(REPORTS_DIR, 'loadtest_results.svg'), svg);

  console.log(`\n✅ Load test benchmark complete. Artifacts written to server/reports/ loadtest_results.*`);
}

benchmark().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
