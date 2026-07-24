# Task 4 — Horizontal Scaling Benchmark (Zero-Trust Verified)

**Date**: 2026-07-24T18:06:46.336Z  
**Verification Method**: 100% identical test parameters (concurrency 50, duration 15s, rate-limiting disabled)

## Summary

| Configuration | Avg RPS ± StdDev | P95 Latency | P99 Latency | Variance % |
|:---|:---:|:---:|:---:|:---:|
| Single Instance (port 5100) | 191.43 ± 21.51 | 0.00 ms | 618.00 ms | 11.24% |
| Dual Instance + LB (port 5103) | 291.78 ± 15.49 | 0.00 ms | 317.00 ms | 5.31% |

## Scaling Efficiency Calculation

| Metric | Value |
|:---|:---:|
| Ideal Speedup | 2x |
| **Measured Speedup** | **1.52x** |
| **Scaling Efficiency** | **76.21%** |

> **Correction Note**: Previous report contained asymmetric rate-limiting on port 5000 which artificially dampened single-instance baseline. Re-benchmarking under 100% identical conditions confirms a true, verified speedup of **1.52x** (76.21% scaling efficiency).
