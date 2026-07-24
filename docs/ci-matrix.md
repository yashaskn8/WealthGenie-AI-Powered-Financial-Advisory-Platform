# Continuous Integration (CI) Test Matrix & Quality Gate Specification

## Overview

This repository uses automated GitHub Actions CI matrix testing (`.github/workflows/ci.yml`) to ensure production-grade reliability across node runtimes, database versions, and operating systems.

## Test Matrix Configuration

### 1. Backend Test Matrix (`backend-test-matrix`)

| Dimension | Target Environments |
|:---|:---|
| **Operating Systems** | `ubuntu-latest`, `windows-latest` |
| **Node.js Versions** | `18.x`, `20.x`, `22.x` |
| **MongoDB Versions** | `6.0`, `7.0` (via `mongodb-memory-server`) |
| **Parallel Combinations** | **12 jobs** |

#### Execution Steps:
1. `npm ci` (clean dependency installation)
2. `npm run test:coverage` (runs Node.js test runner with `c8` coverage — text, json, lcovonly)
3. `npm run loadtest` (performance benchmark with P95 < 500ms and < 1% error rate threshold)

---

### 2. Frontend Test Matrix (`frontend-test-matrix`)

| Dimension | Target Environments |
|:---|:---|
| **Operating Systems** | `ubuntu-latest`, `windows-latest` |
| **Node.js Versions** | `18.x`, `20.x`, `22.x` |
| **Parallel Combinations** | **6 jobs** |

#### Execution Steps:
1. `npm ci`
2. `npm test` (runs Vitest suite with JSDOM environment)

---

## Quality Gate Standards

1. **Deterministic Execution**: Zero flaky tests, offline execution enabled via `mongodb-memory-server`.
2. **Coverage Threshold**: Line coverage maintained at **>82%** statement/line coverage.
3. **No HTML Artifacts**: HTML report generation completely disabled in favor of text, JSON, and LCOV.
4. **Load Test Pass**: P95 latency strictly < 500ms under 100 concurrent virtual users.
5. **Mutation Score**: Core engines (`xirrCalculator.js`, `taxEngine.js`) maintain 100% mutant kill rate.
