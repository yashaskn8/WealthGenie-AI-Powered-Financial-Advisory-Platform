# Security Contract & Auth Audit — Task 8

**Audit Date**: 2026-07-24  
**Scope**: All 20 API Endpoints

## Security Enforcement Matrix

| Endpoint Group | Auth Scheme | Token Revocation Check | IDOR Protection | Rate Limit Tier | Joi Input Sanitization |
|:---|:---:|:---:|:---:|:---:|:---:|
| **Public Auth** (`/api/auth/*`) | None | N/A | N/A | Dedicated Auth Limiter (10 req/15m) | Strict Joi Schema |
| **User Profile** (`/api/profile/*`) | Bearer JWT | Redis Blacklist Check | Document Owner Verification (`isOwner`) | Standard Tier (100 req/15m) | Strict Joi Schema |
| **Financial Goals** (`/api/goals/*`) | Bearer JWT | Redis Blacklist Check | Mongoose Query Scoping (`userId`) | Standard Tier (100 req/15m) | Strict Joi Schema |
| **Portfolio Engine** (`/api/portfolio/*`) | Bearer JWT | Redis Blacklist Check | Mongoose Query Scoping (`userId`) | Standard Tier (100 req/15m) | Strict Joi Schema |
| **Recommendations** (`/api/recommend`) | Public / Bearer | Optional Token | In-Memory Calculations | Engine Limiter (30 req/15m) | Strict Joi Schema |
| **Tax & Instruments** (`/api/tax/*`, `/api/instruments/*`) | Public | N/A | N/A | Standard Tier (100 req/15m) | Strict Joi Schema |

## Security Contract Summary
Zero undocumented authentication or authorization behavior detected across all 20 endpoints.
