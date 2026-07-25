# Horizontal Scaling Benchmark

## Real Redis benchmark (no Docker)

**Date**: 2026-07-25T21:43:02.630Z
**Methodology**:
- Both app instances connected to a real hosted Redis (Upstash) specified by REDIS_URL in .env.
- The load balancer is `scripts/lb-proxy.js`, a simple round-robin HTTP proxy script — not NGINX, HAProxy, or any production load balancer.
- Both app instances ran as local Node.js processes on the same physical machine, not separate hosts.
- The only change from the original simulation is that Redis is now real. The load balancer and execution topology are unchanged.

**Parameters**: concurrency 50, duration 15s × 3 runs averaged, rate-limiting disabled, endpoint `/health/ready`

| Configuration | Avg RPS ± StdDev | P95 Latency | P99 Latency | Variance % |
|:---|:---:|:---:|:---:|:---:|
| Single Instance (port 5100) | 1934.7 ± 186.84 | 5.06 ms | 13.16 ms | 9.66% |
| Dual Instance + LB (port 5103) | 1592.5 ± 2.58 | 10.19 ms | 16.36 ms | 0.16% |

| Metric | Value |
|:---|:---:|
| Ideal Speedup | 2x |
| **Measured Speedup** | **0.82x** |
| **Scaling Efficiency** | **41%** |

---

## Local simulation (original, superseded)

> This earlier benchmark used `scripts/redis-emulator.js` (an in-memory fake Redis) instead of a real Redis instance. It validated that the application code is stateless, but the Redis behavior was not representative. The numbers below are retained for comparison.

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
