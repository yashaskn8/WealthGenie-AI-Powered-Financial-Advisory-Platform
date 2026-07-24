# ADR 001: Historical Gap Analysis & Restoration of Production CI/CD

## Status
**ACCEPTED** (Restored & Enforced)

## Context & Historical Analysis
In commit `17c729c`, the automated CI workflow `.github/workflows/ci.yml` was temporarily omitted from tracking during a repository reorganization and cleanup phase. This created a historical gap where continuous integration reliance shifted temporarily to developer local pre-commit discipline.

### Root Cause of Removal:
1. Local git configuration adjustments during asset cleanup caused workflow files in `.github/` to be untracked.
2. Lack of strict remote branch protection rules on GitHub allowed commits to land on `main` without requiring a passing workflow status check.

## Lessons Learned
1. **Never rely solely on local developer discipline**: Local Husky hooks can be bypassed (`git commit --no-verify`). Automated remote CI gating is mandatory.
2. **Declarative Branch Protection**: The default branch must enforce mandatory status checks (`Backend`, `Frontend`, `ML`, `Lint`, `Secret Scan`, `Docs Sync`).
3. **Automated Enforcement**: All quality gates must execute in clean, containerized, non-interactive CI runners.

## Restored Infrastructure & Current Enforcement Model

1. **Multi-Job Matrix CI Pipeline**:
   - **Backend Job**: Node.js `20.x` & `22.x`, MongoDB `6.0` & `7.0`, `npm ci`, test execution (`c8` text/json/lcov), load test benchmark.
   - **Frontend Job**: Node.js `20.x` & `22.x`, `npm ci`, Vitest suite with JSDOM environment.
   - **ML Microservice Job**: Python `3.12`, `pytest` suite, TreeSHAP explainer validation.
   - **Quality Gates**: ESLint gate, Secret Scanner gate (`scripts/secret-scanner.js`), Documentation Sync gate (`scripts/check_docs_sync.js`).
2. **Local Pre-commit Mirroring**:
   - Husky pre-commit hooks (`.husky/pre-commit`) mirroring CI checks locally to prevent pushing invalid commits.
