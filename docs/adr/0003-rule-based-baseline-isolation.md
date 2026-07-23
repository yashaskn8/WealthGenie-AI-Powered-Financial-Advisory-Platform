# ADR-003: Rule-Based Baseline Isolation

## Status
Accepted

## Date
2026-07-23

## Context
Prior to refactoring, the handwritten rule function `assign_target_instruments()` was used as the sole generator of ML training targets. During the architectural redesign, we faced a choice: should `assign_target_instruments()` be completely deleted from the codebase, or retained under a restricted contract?

Deleting the function entirely would erase historical baseline reference points, making it impossible to quantitatively measure how the retrained ML model compares against legacy rule heuristics on identical test samples. Conversely, keeping the function active within training loops risks re-introducing circular supervision.

## Decision
We decided to retain `assign_target_instruments()` in `ml-service/model/train.py`, but **strictly demote and isolate it to two non-training roles**:
1. **Isolated Held-Out Test Set Benchmarking:** During pipeline evaluation, `assign_target_instruments()` is evaluated on the identical held-out test split ($X_{\text{test}}, y_{\text{test}}$) to compute the target agreement delta ($\Delta = \text{Model Accuracy} - \text{Baseline Accuracy} = +67.55\%$).
2. **Low-Confidence Serving Fallback:** In the FastAPI microservice (`main.py`) and Express client (`mlClient.js`), when a model prediction probability falls below the calibrated serving threshold ($P < 0.8362$) or when the ML microservice is unreachable, the system falls back to rule-based evaluation (`low_confidence: true`).

We enforced complete isolation via AST static analysis (`test_label_construction.py`), ensuring that `assign_target_instruments()` can never be invoked during feature engineering, target construction, or model fitting.

## Alternatives Considered

### 1. Completely Delete `assign_target_instruments()`
- **Pros:** Completely removes legacy code.
- **Cons:** Erases comparative benchmark metrics; removes rule-based fallback capabilities during microservice downtime.
- **Reason for Rejection:** Loss of baseline evaluation rigor and system resilience.

### 2. Blend Rule Heuristic Into Training Labels
- **Pros:** Combines heuristic rules with NAV data.
- **Cons:** Re-introduces circular supervision; violates anti-circularity invariants.
- **Reason for Rejection:** Reintroduced circular ML labeling under a different name.

## Consequences

### Positive
- Enables transparent quantitative benchmarking on identical held-out test data.
- Provides fallback serving during network partitions or low-confidence edge predictions.
- AST static analysis guarantees that the rule function never influences model weights during training.

### Negative / Trade-Offs
- Requires maintaining `assign_target_instruments()` alongside the new `label_construction.py` engine.

## References
- [train.py](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/ml-service/model/train.py)
- [main.py](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/ml-service/main.py)
- [mlClient.js](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/server/services/mlClient.js)
- [ADR-001: Elimination of Circular Labeling](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/docs/adr/0001-elimination-of-circular-labeling.md)
- [ADR-004: Confidence Calibration and Fallback Serving](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/docs/adr/0004-confidence-calibration-and-fallback-serving.md)
