# Load Test Report

**Date**: 2026-07-24T19:10:10.100Z
**Endpoint**: `http://127.0.0.1:5000/health/ready`
**Concurrent Users**: 100
**Duration**: 10s

## Results

| Metric | Value |
|:---|:---|
| Total Requests | 2900 |
| Errors | 0 |
| Error Rate | 0.00% |
| Throughput | 282.16 req/s |

## Latency Distribution

| Percentile | Latency (ms) |
|:---|:---|
| Min | 160.49 |
| P50 | 226.65 |
| P95 | 499.23 |
| P99 | 762.40 |
| Max | 814.84 |

## Threshold Checks

| Threshold | Target | Actual | Status |
|:---|:---|:---|:---|
| P95 Latency | < 500ms | 499.23ms | ✅ PASS |
| Error Rate | < 1% | 0.00% | ✅ PASS |

## Verdict: **PASS**
