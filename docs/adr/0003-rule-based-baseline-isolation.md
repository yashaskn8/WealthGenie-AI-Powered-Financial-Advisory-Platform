# ADR-003: Rule-Based Baseline Isolation

## Status
Accepted

## Date
2026-07-23

## Context
In early system prototypes, rule-based heuristics were directly used to generate inference predictions in the main backend service. As machine learning models were developed, legacy rule code risk becoming mixed with ML inference logic, making baseline benchmarking unclear.

## Decision
We completely isolated rule-based logic into dedicated, non-interfering modules:
1. **Isolated Baseline Scorer:** Legacy suitability rules were isolated to `suitability_config.json` and a baseline evaluator strictly used during offline test evaluation (`train.py`).
2. **Deterministic Serving Fallback:** In production (`main.py` and `mlClient.js`), rule fallback is triggered ONLY when model confidence drops below the dynamic calibration threshold ($P < 0.8362$), returning `low_confidence: true` with explicit UI disclosure.
3. **Benchmarking Boundary:** Offline training explicitly measures ML model performance against the rule baseline, logging accuracy, macro F1, and MCC deltas.

## Alternatives Considered

### 1. Mixed Hybrid Execution (Blending Rule & Model Scores at Runtime)
- **Pros:** Smooth transition between rule heuristic and model.
- **Cons:** Obscures model evaluation; prevents clean SHAP explainability.
- **Reason for Rejection:** Unclear attribution and non-standard architecture.

## Consequences

### Positive
- Clean separation of concerns between ML microservice inference and fallback serving.
- Model performance can be benchmarked against rule baselines with zero circular leakage.

### Negative / Trade-Offs
- Requires maintaining rule fallback execution paths alongside ML microservice endpoints.

## References
- [train.py](../../ml-service/model/train.py)
- [main.py](../../ml-service/main.py)
- [mlClient.js](../../server/services/mlClient.js)
- [ADR-001: Elimination of Circular Labeling](0001-elimination-of-circular-labeling.md)
- [ADR-004: Confidence Calibration and Fallback Serving](0004-confidence-calibration-and-fallback-serving.md)
