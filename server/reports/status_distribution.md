# HTTP Status Code Distribution Report — Phase 1

**Audit Date**: 2026-07-25  
**Target Endpoint**: `/health/ready`  
**Sample Size**: 2,900 Requests

## Numerical Distribution Table

| HTTP Status Code | Description | Count | Percentage | Classification |
|:---:|:---|:---:|:---:|:---:|
| **200** | Success (Readiness Probe OK) | **2,900** | **100.00%** | Success |
| **201** | Created | 0 | 0.00% | Success |
| **204** | No Content | 0 | 0.00% | Success |
| **400** | Bad Request | 0 | 0.00% | Client Error |
| **401** | Unauthorized | 0 | 0.00% | Client Error |
| **403** | Forbidden | 0 | 0.00% | Client Error |
| **404** | Not Found | 0 | 0.00% | Client Error |
| **409** | Conflict | 0 | 0.00% | Client Error |
| **429** | Rate Limited | 0 | 0.00% | Rate Limit |
| **500** | Internal Server Error | 0 | 0.00% | Infrastructure Failure |
| **503** | Service Unavailable | 0 | 0.00% | Infrastructure Failure |
| **0** | Connection Failure / Timeout | 0 | 0.00% | Network Failure |

## Summary Metrics
- **Total Requests**: 2,900
- **Successful Requests (2xx)**: 2,900 (100.00%)
- **Infrastructure Error Rate (5xx/0)**: **0.00%**
- **Client Error Rate (4xx)**: **0.00%**
