# Load Test Report

**Date**: 2026-07-24T19:33:04.212Z
**Endpoint**: `http://127.0.0.1:5000/health/ready`
**Concurrent Users**: 100
**Duration**: 10s

## Results

| Metric | Value |
|:---|:---|
| Total Requests | 4600 |
| Errors | 0 |
| Error Rate | 0.00% |
| Throughput | 454.14 req/s |

## Latency Distribution

| Percentile | Latency (ms) |
|:---|:---|
| Min | 23.27 |
| P50 | 132.80 |
| P95 | 182.61 |
| P99 | 354.55 |
| Max | 368.70 |

## Threshold Checks

| Threshold | Target | Actual | Status |
|:---|:---|:---|:---|
| P95 Latency | < 500ms | 182.61ms | ✅ PASS |
| Error Rate | < 1% | 0.00% | ✅ PASS |

## Verdict: **PASS**
