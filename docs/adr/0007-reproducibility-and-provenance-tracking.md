# ADR-007: Reproducibility and Provenance Tracking

## Status
Accepted

## Date
2026-07-23

## Context
In production machine learning systems, inability to reproduce exact training artifacts, performance metrics, or model binaries creates severe operational and compliance risks. Without explicit tracking of code revisions, raw data versions, policy configuration files, and random seeds, model behavior becomes non-deterministic and untraceable.

## Decision
We implemented a strict, end-to-end reproducibility and provenance tracking architecture:
1. **Git Commit Hash Binding:** Every training run automatically queries `git rev-parse --short HEAD` and embeds the exact commit hash (`ffa37ba`) into binary models and `metadata.json`.
2. **Dataset & Policy Versioning:** The underlying market dataset (`dataset_version: "3.0.0"`) and suitability policy configuration (`policy_config_version: "1.0.0"`) are explicitly versioned and tracked.
3. **Environment & Hardware Capture:** `train.py` captures Python runtime version (`3.12.3`), operating system platform details, and a unique environment SHA-256 hash (`2d94978357`).
4. **Deterministic Seed Control:** Random number generators across `numpy`, `pandas`, `sklearn`, and synthetic dataset generation are pinned to fixed random seeds (`random_state=42`).

## Alternatives Considered

### 1. Manual Version Documentation in Text Files
- **Pros:** No code required.
- **Cons:** Highly error-prone; frequently forgotten; fails automated verification.
- **Reason for Rejection:** Fails automated software engineering principles.

### 2. Full Container Image Pinning (Docker Hashes) Only
- **Pros:** Captures OS binaries.
- **Cons:** Heavyweight; does not record internal git commit or policy configuration state within application artifacts.
- **Reason for Rejection:** Necessary but insufficient on its own; application-level metadata binding is still required.

## Consequences

### Positive
- Every trained `.pkl` artifact can be traced back to its exact git commit, suitability policy config, raw NAV dataset, and Python environment.
- Independent engineers can re-run `train.py` and produce byte-for-byte identical dataset artifacts and evaluation metrics.
- Enforced by automated tests in `test_label_construction.py`.

### Negative / Trade-Offs
- Requires subprocess git queries during pipeline execution.

## References
- [train.py](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/ml-service/model/train.py)
- [metadata.json](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/ml-service/model/metadata.json)
- [suitability_config.json](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/ml-service/config/suitability_config.json)
- [test_label_construction.py](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/ml-service/tests/test_label_construction.py)
