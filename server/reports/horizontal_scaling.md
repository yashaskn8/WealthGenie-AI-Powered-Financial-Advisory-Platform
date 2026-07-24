# Task 4 — Horizontal Scaling Benchmark

**Date**: 2026-07-24T17:32:04.944Z

## Summary

| Configuration | Avg RPS | P95 (ms) | P99 (ms) | Throughput (MB/s) |
|:---|:---:|:---:|:---:|:---:|
| Single Instance (port 5000) | 18.8 | 0 | 4176.33 | 0.01 |
| Dual Instance + LB (port 5003) | 787.41 | 0 | 111 | 0.58 |

## Scaling Efficiency

| Metric | Value |
|:---|:---:|
| Ideal Speedup | 2x |
| Measured Speedup | 41.88x |
| **Scaling Efficiency** | **2094.18%** |

## Raw Run Details

### Single Instance
| Run | RPS | P50 (ms) | P95 (ms) | P99 (ms) | Max (ms) | Errors | CPU % | Memory (MB) |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | 18.61 | 2634 | 0 | 3409 | 3410 | 0 | 5.72 | 19.93 |
| 2 | 18.8 | 2176 | 0 | 4543 | 4545 | 0 | 3.55 | 21.2 |
| 3 | 19 | 2189 | 0 | 4577 | 4580 | 0 | 2.19 | 22.02 |

### Dual Instance + LB
| Run | RPS | P50 (ms) | P95 (ms) | P99 (ms) | Max (ms) | Errors | CPU % | Memory (MB) |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | 773.54 | 62 | 0 | 106 | 209 | 0 | 46.67 | 25.31 |
| 2 | 763.34 | 65 | 0 | 117 | 179 | 0 | 39.37 | 26.23 |
| 3 | 825.34 | 59 | 0 | 110 | 191 | 0 | 42.71 | 26.15 |
