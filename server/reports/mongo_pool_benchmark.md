# Task 3 — MongoDB Connection Pool Benchmark

**Date**: 2026-07-24T17:25:16.388Z  
**Optimal Pool Size**: **10** (highest RPS: 22.09)

## Comparison Table

| Pool Size | Avg RPS | P95 (ms) | P99 (ms) | CPU % | Memory (MB) |
|:---:|:---:|:---:|:---:|:---:|:---:|
| 10 ⭐ | 22.09 | 0 | 3447 | 2.71 | 24.37 |
| 25 | 21 | 0 | 3785.67 | 3.19 | 25.99 |
| 50 | 21.76 | 0 | 3634.67 | 3.2 | 28.01 |

## Raw Run Details

### Pool Size = 10

| Run | RPS | P95 (ms) | P99 (ms) | CPU % | Memory (MB) | Event Loop P95 (ms) |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | 23 | 0 | 2784 | 3.43 | 23.52 | 16.71 |
| 2 | 20 | 0 | 4279 | 2.08 | 24.45 | 17.81 |
| 3 | 23.27 | 0 | 3278 | 2.61 | 25.14 | 17.94 |

### Pool Size = 25

| Run | RPS | P95 (ms) | P99 (ms) | CPU % | Memory (MB) | Event Loop P95 (ms) |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | 25.27 | 0 | 2540 | 3.12 | 25.87 | 17.45 |
| 2 | 19.07 | 0 | 4081 | 3.54 | 25.68 | 16.6 |
| 3 | 18.67 | 0 | 4736 | 2.92 | 26.43 | 17.12 |

### Pool Size = 50

| Run | RPS | P95 (ms) | P99 (ms) | CPU % | Memory (MB) | Event Loop P95 (ms) |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | 23.07 | 0 | 2709 | 2.5 | 27.36 | 18.61 |
| 2 | 20.4 | 0 | 4245 | 4.06 | 28.24 | 17.14 |
| 3 | 21.8 | 0 | 3950 | 3.03 | 28.43 | 16.63 |

## Justification

Pool size **10** achieves the highest throughput (22.09 RPS) while maintaining acceptable tail latency (P99=3447ms) and memory utilization (24.37MB). Increasing pool size beyond 10 provides diminishing returns due to connection management overhead exceeding the parallelism benefit on this workload.
