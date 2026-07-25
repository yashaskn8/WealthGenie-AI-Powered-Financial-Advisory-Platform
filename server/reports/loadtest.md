# Load Test Report

**Date**: 2026-07-25T13:28:34.395Z
**Endpoint**: `http://127.0.0.1:5000/health/ready`
**Concurrent Users**: 100
**Duration**: 10s

## Results

| Metric | Value |
|:---|:---|
| Total Requests | 22800 |
| Errors | 0 |
| Error Rate | 0.00% |
| Throughput | 2269.33 req/s |

## Latency Distribution

| Percentile | Latency (ms) |
|:---|:---|
| Min | 14.14 |
| P50 | 17.26 |
| P95 | 25.85 |
| P99 | 37.32 |
| Max | 91.33 |

## Threshold Checks

| Threshold | Target | Actual | Status |
|:---|:---|:---|:---|
| P95 Latency | < 500ms | 25.85ms | ✅ PASS |
| Error Rate | < 1% | 0.00% | ✅ PASS |

## Verdict: **PASS**
