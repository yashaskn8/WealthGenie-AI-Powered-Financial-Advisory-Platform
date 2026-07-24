# Task 2 — Bottleneck Analysis Report

**Date**: 2026-07-24T17:22:22.180Z

## Identified Bottleneck

> **HTTP Handler**: Slowest handler: /api/recommend at 71.84ms avg

## Subsystem Measurements

### MongoDB
| Metric | Value |
|:---|:---:|
| Ping Latency | N/A ms |
| List Collections | N/A ms |
| Pool Size | N/A |

### Redis
| Metric | Value |
|:---|:---:|
| Health Endpoint | 224.25 ms |
| Status | unknown |

### HTTP Handler Latencies (10 requests each)
| Endpoint | Avg (ms) | P50 (ms) | P95 (ms) | P99 (ms) | Min (ms) | Max (ms) |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|
| `/api/health` | 62.92 | 62.62 | 80.3 | 80.3 | 49.93 | 80.3 |
| `/api/goals` | 55.88 | 58.79 | 71.63 | 71.63 | 40.46 | 71.63 |
| `/api/portfolio` | 58.34 | 59.58 | 91.74 | 91.74 | 42.02 | 91.74 |
| `/api/recommend` | 71.84 | 61.52 | 130.98 | 130.98 | 49.51 | 130.98 |

### Event Loop Delay (under 50 concurrent load)
| Metric | Value (ms) |
|:---|:---:|
| Mean | 15.52 |
| P50 | 15.55 |
| P95 | 18.86 |
| P99 | 21.4 |
| Max | 25.51 |

### CPU & Memory (under 50 concurrent load, 10s)
| Metric | Value |
|:---|:---:|
| CPU User | 172000 μs |
| CPU System | 266000 μs |
| CPU Total | 4.38% |
| Heap Used | 23.93 MB |
| Heap Total | 25.21 MB |
| RSS | 87.04 MB |
