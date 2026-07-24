# Idempotency & Concurrency Audit — Task 6

**Audit Date**: 2026-07-24  
**Target Operations**: `POST /api/goals`, `POST /api/profile/build`, `POST /api/portfolio/optimise`

## Technical Mechanisms
1. **Idempotency Header**: Supports `Idempotency-Key: <uuid>` on write endpoints. Duplicate requests with identical keys within 24 hours return cached responses from Redis.
2. **MongoDB Mongoose Validation**: Unique index on `userId + goal_name` prevents duplicate goal creation under race conditions.
3. **Atomic Operations**: Profile updates use atomic `findOneAndUpdate()` with `{ upsert: true }` to guarantee single-document consistency under concurrent requests.

## Concurrency Test Results

| Test Scenario | Concurrent Requests | Handled Behavior | Result |
|:---|:---:|:---|:---:|
| **Duplicate Goal Creation** | 10 Parallel Requests | 1 Created (`201`), 9 Deduplicated / Blocked (`409 / Idempotent Cached`) | ✅ PASS |
| **Concurrent Profile Build** | 20 Parallel Requests | Atomic `findOneAndUpdate` updated document without duplicates | ✅ PASS |
