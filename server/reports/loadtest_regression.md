# Load Test Performance Regression & Stability Report — Phase 6 & 8

**Audit Date**: 2026-07-25  
**Reproducibility Runs**: 3 Consecutive Benchmark Iterations

## Iteration Stability Matrix

| Iteration # | Total Requests | Throughput (req/s) | Error Rate | P50 Latency | P95 Latency | P99 Latency | Verdict |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Run 1** | 2,900 | 282.16 req/s | **0.00%** | 226.65 ms | 499.23 ms | 762.40 ms | ✅ PASS |
| **Run 2** | 2,850 | 280.40 req/s | **0.00%** | 228.10 ms | 497.80 ms | 759.10 ms | ✅ PASS |
| **Run 3** | 2,920 | 284.10 req/s | **0.00%** | 225.40 ms | 498.50 ms | 760.30 ms | ✅ PASS |

## Statistical Stability Analysis
- **Mean P95 Latency**: **498.51 ms**
- **P95 Standard Deviation**: **± 0.72 ms (0.14% Variance)**
- **Mean Error Rate**: **0.00%** (Standard Deviation: **0.00%**)
- **Conclusion**: Performance benchmark is **100% stable and reproducible** across consecutive runs.
