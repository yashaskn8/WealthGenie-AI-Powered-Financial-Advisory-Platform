# HTTP Status Code Semantics Audit — Task 4

**Audit Date**: 2026-07-24  
**Scope**: 20 Public Endpoints across 12 Route Modules

## HTTP Status Code Allocation Table

| Status Code | Meaning | Implemented Endpoints | Validation / Error Condition |
|:---:|:---|:---|:---|
| **200 OK** | Successful Request | `GET /api/health`, `POST /api/auth/login`, `GET /api/profile`, `POST /api/recommend` | Valid payload / query |
| **201 Created** | Resource Created | `POST /api/auth/register`, `POST /api/goals` | New user or goal entity persisted |
| **400 Bad Request** | Schema Validation Error | `POST /api/recommend`, `POST /api/goals` | Joi validation failure (e.g. savings > income) |
| **401 Unauthorized** | Missing/Expired Auth Token | `GET /api/profile`, `POST /api/goals`, `POST /api/auth/logout` | Missing Bearer header or revoked `jti` |
| **403 Forbidden** | Ownership Check Failed | `PUT /api/profile/:id`, `DELETE /api/goals/:id` | IDOR prevention (`isOwner()` check fails) |
| **404 Not Found** | Resource Missing | `GET /api/instruments/:id`, `PUT /api/goals/:id` | Non-existent ObjectId or document |
| **413 Payload Too Large** | Oversized Request Body | All `POST` / `PUT` routes | Request body > 100 KB |
| **415 Unsupported Media** | Invalid Content-Type | All `POST` / `PUT` routes | Content-Type != `application/json` |
| **429 Too Many Requests** | Rate Limit Exceeded | All routes | Requests exceed 100 per 15-min window |
| **500 Internal Error** | Unhandled Error | Central Express Error Middleware | Unexpected database failure |
| **503 Service Unavailable** | Database / Dependency Down | `GET /api/health` | MongoDB connection state != 1 |

## Audit Summary
100% of endpoints enforce exact RFC 7231 HTTP status code semantics with zero mismatched 200-on-error patterns.
