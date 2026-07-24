# Benchmark Authentication Audit — Phase 2

**Audit Date**: 2026-07-25  
**Target Operations**: Public vs Protected Endpoint Benchmarking

## Auth Audit Policy & Execution
1. **Public Endpoint Benchmarking**: Unauthenticated probes (`/health/ready`, `/health/live`, `/api/instruments`) are benchmarked directly without auth headers.
2. **Protected Endpoint Benchmarking**: User-owned write/read endpoints (`/api/goals`, `/api/portfolio`) undergo an automated **Authentication Bootstrap Sequence**:
   ```text
   Register (POST /api/auth/register)
      ↓
   Login (POST /api/auth/login)
      ↓
   Extract Bearer JWT
      ↓
   Attach Header (`Authorization: Bearer <jwt>`)
      ↓
   Execute Load Benchmark
   ```
3. **Token Blacklist Validation**: Token revocation (`isTokenBlacklisted`) is verified via Redis during benchmark iterations to ensure valid auth context.
