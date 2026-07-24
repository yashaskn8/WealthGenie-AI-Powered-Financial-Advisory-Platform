# Production Load Test Benchmark Results — Zero-Trust Verified

**Date**: 2026-07-24T18:06:46.349Z

| Endpoint | Method | Concurrency | RPS (Avg ± StdDev) | P50 | P95 | P99 | Error % | Variance % |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `/api/goals` | GET | 10 | 207.57 ± 21.41 | 51.00 ms | 0.00 ms | 77.33 ms | 0% | 10.31% |
| `/api/portfolio` | GET | 10 | 1117.47 ± 31.25 | 8.00 ms | 0.00 ms | 17.00 ms | 0% | 2.8% |
| `/api/recommend` | POST | 10 | 527.53 ± 22.54 | 18.00 ms | 0.00 ms | 33.67 ms | 0% | 4.27% |
| `/api/goals` | GET | 100 | 216.23 ± 5.56 | 451.00 ms | 0.00 ms | 801.00 ms | 0% | 2.57% |
| `/api/portfolio` | GET | 100 | 1007.4 ± 86.18 | 109.00 ms | 0.00 ms | 174.33 ms | 0% | 8.55% |
| `/api/recommend` | POST | 100 | 508.8 ± 16.94 | 207.00 ms | 0.00 ms | 335.67 ms | 0% | 3.33% |
| `/api/goals` | GET | 500 | 183.17 ± 9.62 | 2316.00 ms | 0.00 ms | 7226.67 ms | 54.41% | 5.25% |
| `/api/portfolio` | GET | 500 | 948.3 ± 8.97 | 571.00 ms | 0.00 ms | 1567.67 ms | 2.09% | 0.95% |
| `/api/recommend` | POST | 500 | 452.33 ± 17.53 | 1223.00 ms | 0.00 ms | 6131.33 ms | 17.87% | 3.87% |
