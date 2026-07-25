# Load Test Report

**Date**: 2026-07-25T13:36:48.063Z
**Endpoint**: `http://127.0.0.1:5000/health/ready`
**Concurrent Users**: 100
**Duration**: 10s

## Results

| Metric | Value |
|:---|:---|
| Total Requests | 29500 |
| Errors | 0 |
| Error Rate | 0.00% |
| Throughput | 2936.78 req/s |

## Latency Distribution

| Percentile | Latency (ms) |
|:---|:---|
| Min | 4.30 |
| P50 | 6.98 |
| P95 | 15.16 |
| P99 | 22.30 |
| Max | 70.56 |

## Threshold Checks

| Threshold | Target | Actual | Status |
|:---|:---|:---|:---|
| P95 Latency | < 500ms | 15.16ms | ✅ PASS |
| Error Rate | < 1% | 0.00% | ✅ PASS |

## Verdict: **PASS**
