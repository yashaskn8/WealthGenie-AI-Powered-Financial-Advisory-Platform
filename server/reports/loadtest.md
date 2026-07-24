# Load Test Report

**Date**: 2026-07-24T19:45:54.032Z
**Endpoint**: `http://127.0.0.1:5000/health/ready`
**Concurrent Users**: 100
**Duration**: 10s

## Results

| Metric | Value |
|:---|:---|
| Total Requests | 4100 |
| Errors | 0 |
| Error Rate | 0.00% |
| Throughput | 407.11 req/s |

## Latency Distribution

| Percentile | Latency (ms) |
|:---|:---|
| Min | 28.60 |
| P50 | 143.71 |
| P95 | 223.55 |
| P99 | 371.94 |
| Max | 378.58 |

## Threshold Checks

| Threshold | Target | Actual | Status |
|:---|:---|:---|:---|
| P95 Latency | < 500ms | 223.55ms | ✅ PASS |
| Error Rate | < 1% | 0.00% | ✅ PASS |

## Verdict: **PASS**
