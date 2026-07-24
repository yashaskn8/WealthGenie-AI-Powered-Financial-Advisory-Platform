/**
 * Task 5 — ML Service Scalability Benchmark
 * 
 * Benchmarks the FastAPI ML service at /predict with
 * 1, 10, 50, 100 concurrent connections.
 * 
 * Prereqs: ML service must be running on port 8000
 *   cd ml-service && python -m uvicorn main:app --port 8000
 */

import autocannon from 'autocannon';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const ML_REPORTS_DIR = join(ROOT_DIR, '..', 'ml-service', 'reports');

const ML_BASE_URL = `http://127.0.0.1:8000`;
const DURATION = 15;
const WARMUP = 3;
const NUM_RUNS = 3;
const CONCURRENCY_LEVELS = [1, 10, 50, 100];

const PREDICT_BODY = JSON.stringify({
  age: 32,
  annual_income: 1800000,
  monthly_expenses: 60000,
  risk_tolerance: "Moderate",
  investment_horizon_years: 10,
  existing_investments: [
    { type: "mutual_fund", name: "HDFC Mid Cap", current_value: 500000, monthly_sip: 10000 },
  ],
  goals: [
    { name: "Retirement", target_amount: 50000000, target_year: 2050 }
  ]
});

function runAutocannon(opts) {
  return new Promise((resolve, reject) => {
    autocannon(opts, (err, result) => {
      if (err) return reject(err);
      resolve(result);
    });
  });
}

async function checkMLService() {
  try {
    const res = await fetch(`${ML_BASE_URL}/health`);
    if (res.ok) return true;
  } catch (_) {}
  return false;
}

async function main() {
  mkdirSync(ML_REPORTS_DIR, { recursive: true });

  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  TASK 5 — ML SERVICE SCALABILITY BENCHMARK');
  console.log('══════════════════════════════════════════════════════════\n');

  const isRunning = await checkMLService();
  if (!isRunning) {
    console.log('⚠ ML service not running on port 8000.');
    console.log('  Generating report with BLOCKED status.\n');

    const report = {
      timestamp: new Date().toISOString(),
      status: 'BLOCKED',
      reason: 'ML service (FastAPI) not running on port 8000. Start with: cd ml-service && python -m uvicorn main:app --port 8000',
      results: [],
    };

    writeFileSync(join(ML_REPORTS_DIR, 'ml_scaling.json'), JSON.stringify(report, null, 2));

    let md = `# Task 5 — ML Service Scalability Benchmark\n\n**Status**: BLOCKED\n\n`;
    md += `> ML service is not running on port 8000. To run this benchmark:\n>\n`;
    md += `> \`\`\`bash\n> cd ml-service\n> python -m uvicorn main:app --port 8000\n> node ../server/scripts/run-ml-benchmark.js\n> \`\`\`\n`;

    writeFileSync(join(ML_REPORTS_DIR, 'ml_scaling.md'), md);
    console.log('✅ BLOCKED report written to ml-service/reports/');
    return;
  }

  console.log('✅ ML service is running on port 8000\n');

  const headers = { 'content-type': 'application/json' };
  const results = [];

  for (const concurrency of CONCURRENCY_LEVELS) {
    console.log(`▶ Benchmarking /predict @ ${concurrency} concurrent...`);

    // Warm-up
    await runAutocannon({
      url: `${ML_BASE_URL}/predict`,
      method: 'POST',
      headers,
      body: PREDICT_BODY,
      connections: Math.min(concurrency, 5),
      duration: WARMUP,
    });

    const runs = [];
    for (let run = 1; run <= NUM_RUNS; run++) {
      console.log(`  [Run ${run}/${NUM_RUNS}] ${DURATION}s...`);

      const result = await runAutocannon({
        url: `${ML_BASE_URL}/predict`,
        method: 'POST',
        headers,
        body: PREDICT_BODY,
        connections: concurrency,
        duration: DURATION,
      });

      const totalReqs = result.requests.total || 1;
      runs.push({
        run,
        rps: result.requests.average || 0,
        throughputMbSec: parseFloat(((result.throughput.average || 0) / 1024 / 1024).toFixed(4)),
        avgLatency: result.latency.average || 0,
        p50: result.latency.p50 || 0,
        p95: result.latency.p95 || 0,
        p99: result.latency.p99 || 0,
        maxLatency: result.latency.max || 0,
        errors: result.errors || 0,
        timeouts: result.timeouts || 0,
        errorPct: parseFloat((((result.errors || 0) / totalReqs) * 100).toFixed(2)),
      });
    }

    const avgRps = runs.reduce((a, r) => a + r.rps, 0) / runs.length;
    const avgP95 = runs.reduce((a, r) => a + r.p95, 0) / runs.length;
    const avgP99 = runs.reduce((a, r) => a + r.p99, 0) / runs.length;

    results.push({
      concurrency,
      runs,
      aggregate: {
        avgRps: parseFloat(avgRps.toFixed(2)),
        avgP95: parseFloat(avgP95.toFixed(2)),
        avgP99: parseFloat(avgP99.toFixed(2)),
        avgErrorPct: parseFloat((runs.reduce((a, r) => a + r.errorPct, 0) / runs.length).toFixed(2)),
      },
    });

    console.log(`  ✔ RPS=${avgRps.toFixed(2)} P95=${avgP95.toFixed(2)}ms P99=${avgP99.toFixed(2)}ms\n`);
  }

  // Determine if inference or API is bottleneck
  const singleReqLatency = results.find(r => r.concurrency === 1)?.aggregate.avgP95 || 0;
  const highConcLatency = results.find(r => r.concurrency === 100)?.aggregate.avgP95 || 0;
  const latencyGrowth = highConcLatency / (singleReqLatency || 1);
  const bottleneck = latencyGrowth > 10 ? 'Model Inference (CPU-bound)' : 'API Framework Overhead';

  const report = {
    timestamp: new Date().toISOString(),
    status: 'PASS',
    results,
    bottleneck,
    singleReqLatencyMs: singleReqLatency,
    highConcLatencyMs: highConcLatency,
    latencyGrowthFactor: parseFloat(latencyGrowth.toFixed(2)),
  };

  writeFileSync(join(ML_REPORTS_DIR, 'ml_scaling.json'), JSON.stringify(report, null, 2));

  let md = `# Task 5 — ML Service Scalability Benchmark

**Date**: ${report.timestamp}  
**Bottleneck**: ${bottleneck} (latency growth factor: ${latencyGrowth.toFixed(2)}x)

## Summary

| Concurrency | Avg RPS | P95 (ms) | P99 (ms) | Error % |
|:---:|:---:|:---:|:---:|:---:|
`;

  for (const r of results) {
    md += `| ${r.concurrency} | ${r.aggregate.avgRps} | ${r.aggregate.avgP95} | ${r.aggregate.avgP99} | ${r.aggregate.avgErrorPct}% |\n`;
  }

  md += `\n## Raw Run Details\n\n`;
  for (const r of results) {
    md += `### ${r.concurrency} Concurrent\n| Run | RPS | P50 | P95 | P99 | Max | Errors |\n|:---:|:---:|:---:|:---:|:---:|:---:|:---:|\n`;
    for (const run of r.runs) {
      md += `| ${run.run} | ${run.rps} | ${run.p50} | ${run.p95} | ${run.p99} | ${run.maxLatency} | ${run.errors} |\n`;
    }
    md += `\n`;
  }

  writeFileSync(join(ML_REPORTS_DIR, 'ml_scaling.md'), md);
  console.log('✅ Task 5 artifacts written: ml-service/reports/ml_scaling.md, ml_scaling.json');
}

main().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
