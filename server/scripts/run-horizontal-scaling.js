/**
 * Task 4 — Horizontal Scaling Benchmark
 * 
 * Compares single-instance (http://127.0.0.1:5000) vs dual-instance behind LB proxy (http://127.0.0.1:5003).
 */

import autocannon from 'autocannon';
import jwt from 'jsonwebtoken';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = join(__dirname, '..');
const REPORTS_DIR = join(SERVER_DIR, 'reports');

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-12345';
process.env.JWT_SECRET = JWT_SECRET;

const TEST_USER_ID = new mongoose.Types.ObjectId().toString();
const TEST_TOKEN = jwt.sign(
  { userId: TEST_USER_ID, email: 'bench@wealthgenie.test', role: 'user' },
  JWT_SECRET,
  { expiresIn: '24h' }
);

const DURATION = 15;
const WARMUP = 3;
const CONCURRENCY = 50;
const NUM_RUNS = 3;

function runAutocannon(opts) {
  return new Promise((resolve, reject) => {
    autocannon(opts, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

async function benchmarkTarget(url, label) {
  const headers = {
    authorization: `Bearer ${TEST_TOKEN}`,
    'content-type': 'application/json',
  };

  console.log(`▶ Benchmarking ${label} at ${url}...`);

  // Warm-up
  await runAutocannon({ url: `${url}/api/goals`, method: 'GET', headers, connections: 10, duration: WARMUP });

  const runs = [];
  for (let run = 1; run <= NUM_RUNS; run++) {
    console.log(`  [Run ${run}/${NUM_RUNS}] ${CONCURRENCY} connections, ${DURATION}s...`);

    const cpuStart = process.cpuUsage();
    const memStart = process.memoryUsage();

    const result = await runAutocannon({
      url: `${url}/api/goals`,
      method: 'GET',
      headers,
      connections: CONCURRENCY,
      duration: DURATION,
    });

    const cpuEnd = process.cpuUsage(cpuStart);
    const memEnd = process.memoryUsage();

    runs.push({
      run,
      rps: result.requests.average || 0,
      throughputMbSec: parseFloat(((result.throughput.average || 0) / 1024 / 1024).toFixed(2)),
      avgLatency: result.latency.average || 0,
      p50: result.latency.p50 || 0,
      p95: result.latency.p95 || 0,
      p99: result.latency.p99 || 0,
      maxLatency: result.latency.max || 0,
      errors: result.errors || 0,
      cpuPercent: parseFloat((((cpuEnd.user + cpuEnd.system) / (DURATION * 1e6)) * 100).toFixed(2)),
      memoryMb: parseFloat((memEnd.heapUsed / 1024 / 1024).toFixed(2)),
    });
  }

  const avgRps = runs.reduce((a, r) => a + r.rps, 0) / runs.length;
  const avgP95 = runs.reduce((a, r) => a + r.p95, 0) / runs.length;
  const avgP99 = runs.reduce((a, r) => a + r.p99, 0) / runs.length;

  return {
    label,
    runs,
    aggregate: {
      avgRps: parseFloat(avgRps.toFixed(2)),
      avgP95: parseFloat(avgP95.toFixed(2)),
      avgP99: parseFloat(avgP99.toFixed(2)),
      avgThroughput: parseFloat((runs.reduce((a, r) => a + r.throughputMbSec, 0) / runs.length).toFixed(2)),
    },
  };
}

async function main() {
  mkdirSync(REPORTS_DIR, { recursive: true });

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  TASK 4 — HORIZONTAL SCALING BENCHMARK');
  console.log('══════════════════════════════════════════════════════════\n');

  // Single instance
  const singleResult = await benchmarkTarget('http://127.0.0.1:5000', 'Single Instance');
  console.log(`  ✔ Single: RPS=${singleResult.aggregate.avgRps} P95=${singleResult.aggregate.avgP95}ms\n`);

  // Dual instance behind LB
  const dualResult = await benchmarkTarget('http://127.0.0.1:5003', 'Dual Instance (LB)');
  console.log(`  ✔ Dual: RPS=${dualResult.aggregate.avgRps} P95=${dualResult.aggregate.avgP95}ms\n`);

  const idealSpeedup = 2.0;
  const measuredSpeedup = singleResult.aggregate.avgRps > 0
    ? dualResult.aggregate.avgRps / singleResult.aggregate.avgRps
    : 1.0;
  const efficiency = parseFloat(((measuredSpeedup / idealSpeedup) * 100).toFixed(2));

  console.log(`📊 Scaling Efficiency: ${efficiency}% (Measured Speedup: ${measuredSpeedup.toFixed(2)}x / Ideal: ${idealSpeedup}x)`);

  const report = {
    timestamp: new Date().toISOString(),
    single: singleResult,
    dual: dualResult,
    scalingEfficiency: {
      idealSpeedup,
      measuredSpeedup: parseFloat(measuredSpeedup.toFixed(2)),
      efficiencyPercent: efficiency,
    },
  };

  writeFileSync(join(REPORTS_DIR, 'horizontal_scaling.json'), JSON.stringify(report, null, 2));

  let md = `# Task 4 — Horizontal Scaling Benchmark

**Date**: ${report.timestamp}

## Summary

| Configuration | Avg RPS | P95 (ms) | P99 (ms) | Throughput (MB/s) |
|:---|:---:|:---:|:---:|:---:|
| Single Instance (port 5000) | ${singleResult.aggregate.avgRps} | ${singleResult.aggregate.avgP95} | ${singleResult.aggregate.avgP99} | ${singleResult.aggregate.avgThroughput} |
| Dual Instance + LB (port 5003) | ${dualResult.aggregate.avgRps} | ${dualResult.aggregate.avgP95} | ${dualResult.aggregate.avgP99} | ${dualResult.aggregate.avgThroughput} |

## Scaling Efficiency

| Metric | Value |
|:---|:---:|
| Ideal Speedup | ${idealSpeedup}x |
| Measured Speedup | ${measuredSpeedup.toFixed(2)}x |
| **Scaling Efficiency** | **${efficiency}%** |

## Raw Run Details

### Single Instance
| Run | RPS | P50 (ms) | P95 (ms) | P99 (ms) | Max (ms) | Errors | CPU % | Memory (MB) |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
`;

  for (const r of singleResult.runs) {
    md += `| ${r.run} | ${r.rps} | ${r.p50} | ${r.p95} | ${r.p99} | ${r.maxLatency} | ${r.errors} | ${r.cpuPercent} | ${r.memoryMb} |\n`;
  }

  md += `\n### Dual Instance + LB\n| Run | RPS | P50 (ms) | P95 (ms) | P99 (ms) | Max (ms) | Errors | CPU % | Memory (MB) |\n|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|\n`;

  for (const r of dualResult.runs) {
    md += `| ${r.run} | ${r.rps} | ${r.p50} | ${r.p95} | ${r.p99} | ${r.maxLatency} | ${r.errors} | ${r.cpuPercent} | ${r.memoryMb} |\n`;
  }

  writeFileSync(join(REPORTS_DIR, 'horizontal_scaling.md'), md);
  console.log('\n✅ Task 4 artifacts written: horizontal_scaling.md, horizontal_scaling.json');
}

main().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
