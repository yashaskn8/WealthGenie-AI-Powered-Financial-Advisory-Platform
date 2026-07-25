# Horizontal Scaling Benchmark

## Containerized Benchmark

> **Status**: Pending — run `docker compose up --build -d` then `node server/scripts/benchmark-containerized.js` to populate this section with real numbers.

**Environment**: Docker Compose (real MongoDB 7.0, real Redis 7 Alpine, NGINX round-robin LB)
**Parameters**: concurrency 50, duration 15s, rate-limiting disabled

Results will be written to `server/reports/horizontal_scaling_containerized.md` and should be pasted here after execution.

---

## Local Proof-of-Concept (Superseded)

> **Disclosure**: This earlier benchmark ran both Express instances as local Node.js processes on the same machine (ports 5101 and 5102). The "load balancer" was a custom 69-line round-robin HTTP proxy (`scripts/lb-proxy.js`), not a production load balancer. Redis was emulated in-memory (`scripts/redis-emulator.js`), not a real Redis instance. This validates that the application code is stateless and scalable in principle — it does not measure real network latency, real Redis behavior, or real multi-machine variance.

**Date**: 2026-07-24T18:06:46.336Z
**Parameters**: concurrency 50, duration 15s, rate-limiting disabled on both topologies

| Configuration | Avg RPS ± StdDev | P95 Latency | P99 Latency | Variance % |
|:---|:---:|:---:|:---:|:---:|
| Single Instance (port 5100) | 191.43 ± 21.51 | 0.00 ms | 618.00 ms | 11.24% |
| Dual Instance + LB (port 5103) | 291.78 ± 15.49 | 0.00 ms | 317.00 ms | 5.31% |

| Metric | Value |
|:---|:---:|
| Ideal Speedup | 2x |
| Measured Speedup | 1.52x |
| Scaling Efficiency | 76.21% |

> **Correction Note**: Previous report contained asymmetric rate-limiting on port 5000 which artificially dampened single-instance baseline. Re-benchmarking under identical conditions confirmed a measured speedup of 1.52x (76.21% scaling efficiency) in the local simulation environment described above.
