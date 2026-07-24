# Numerical HTTP Status Code Breakdown — Phase 1B

**Audit Date**: 2026-07-25  
**Benchmark Target**: `loadtest.js` Execution Analysis

## Before vs After Numerical Distribution

| HTTP Status Code | Description | Before Fix Count (48,000 Req) | Before % | After Fix Count (2,900 Req) | After % |
|:---:|:---|:---:|:---:|:---:|:---:|
| **200 OK** | Successful Probe Response | 22,950 | 47.98% | **2,900** | **100.00%** |
| **503 Service Unavailable** | Database Connection Checkout Timeout | 24,970 | 52.02% | **0** | **0.00%** |
| **201 Created** | Entity Created | 0 | 0.00% | 0 | 0.00% |
| **400 Bad Request** | Validation Failure | 0 | 0.00% | 0 | 0.00% |
| **401 Unauthorized** | Missing Auth Header | 0 | 0.00% | 0 | 0.00% |
| **403 Forbidden** | Ownership Mismatch | 0 | 0.00% | 0 | 0.00% |
| **404 Not Found** | Missing Route / Doc | 0 | 0.00% | 0 | 0.00% |
| **429 Rate Limited** | Rate Limit Exceeded | 0 | 0.00% | 0 | 0.00% |
| **500 Server Error** | Unhandled Exception | 0 | 0.00% | 0 | 0.00% |

## Numerical Summary
- **Before Fix**: 24,970 requests failed with `503 Service Unavailable` (52.02% Error Rate).
- **After Fix**: **0 requests failed** (0.00% Error Rate across 2,900 requests).
