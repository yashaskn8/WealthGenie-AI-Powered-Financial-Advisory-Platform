# Load Test Report

**Date**: 2026-07-24T16:37:27.118Z
**Endpoint**: `http://127.0.0.1:5000/health/ready`
**Concurrent Users**: 100
**Duration**: 10s

## Results

| Metric | Value |
|:---|:---|
| Total Requests | 2900 |
| Errors | 0 |
| Error Rate | 0.00% |
| Throughput | 283.34 req/s |

## Latency Distribution

| Percentile | Latency (ms) |
|:---|:---|
| Min | 161.84 |
| P50 | 239.27 |
| P95 | 443.98 |
| P99 | 828.22 |
| Max | 876.45 |

## Threshold Checks

| Threshold | Target | Actual | Status |
|:---|:---|:---|:---|
| P95 Latency | < 500ms | 443.98ms | ✅ PASS |
| Error Rate | < 1% | 0.00% | ✅ PASS |

## Verdict: **PASS**
