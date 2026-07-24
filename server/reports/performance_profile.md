# API Latency Profiling Report — Task 1

**Date**: 2026-07-24T18:47:54.587Z  
**Sample Count**: 100 requests per endpoint  
**Measurement Method**: `perf_hooks.performance.now()`

| Endpoint | P50 (ms) | P95 (ms) | P99 (ms) | Average (ms) | Min (ms) | Max (ms) | StdDev | RPS |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `/api/profile` | **0.02** | **0.15** | 0.27 | 0.06 | 0.01 | 3.33 | ±0.33 | **14620.1** |
| `/api/recommend` | **0.08** | **0.18** | 0.87 | 0.26 | 0.07 | 16.56 | ±1.64 | **3765.07** |
| `/api/portfolio` | **0.07** | **0.33** | 0.49 | 0.16 | 0.07 | 4.47 | ±0.44 | **6153.66** |
| `/api/goals` | **0.1** | **0.31** | 0.66 | 0.16 | 0.05 | 3.54 | ±0.35 | **6374.26** |
| `/api/chat` | **0.02** | **0.05** | 0.18 | 0.02 | 0.02 | 0.19 | ±0.03 | **40335.59** |
