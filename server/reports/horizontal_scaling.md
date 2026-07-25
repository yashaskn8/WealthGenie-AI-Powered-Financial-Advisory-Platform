# Task 4 — Horizontal Scaling Benchmark (Local Simulation)

**Date**: 2026-07-24T18:06:46.336Z

## Verification Method — Important Disclosure

This benchmark ran **both Express instances as local Node.js processes on the same machine** (ports 5101 and 5102). The "load balancer" was a custom 69-line round-robin HTTP proxy (`scripts/lb-proxy.js`), not a production load balancer (e.g., NGINX, HAProxy, ALB). Redis was emulated in-memory (`scripts/redis-emulator.js`), not a real Redis instance.

**What this test validates**: The application code is stateless and can handle traffic from a round-robin proxy without request failures — i.e., it is *scalable in principle*.

**What this test does NOT measure**: Real network latency between machines, real Redis serialization/deserialization overhead, real multi-machine variance, OS-level resource contention across hosts, or production load balancer behavior.

Test parameters: concurrency 50, duration 15s, rate-limiting disabled on both topologies.

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

> **Correction Note**: Previous report contained asymmetric rate-limiting on port 5000 which artificially dampened single-instance baseline. Re-benchmarking under identical conditions confirms a measured speedup of **1.52x** (76.21% scaling efficiency) in the local simulation environment described above.
