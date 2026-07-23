# ADR-001: Elimination of Circular Labeling

## Status
Accepted

## Date
2026-07-23

## Context
Prior iterations of the WealthGenie asset allocation recommendation pipeline utilized a circular label construction strategy: synthetic user profile features (Age, Income, Debt, Dependents) were passed into a handwritten rule function (`suitability_config.json` threshold heuristics), and the resulting output category was directly assigned as the supervised target label $y$ for machine learning training.

This created a severe methodology flaw:
- **Circular Supervised Learning:** The classifier was merely learning to approximate a deterministic if/else heuristic, rather than discovering underlying patterns from empirical financial market data.
- **Inflated Accuracy Metrics:** Near-100% test accuracy on such datasets indicated rule memorization rather than generalization to real financial asset dynamics.

## Decision
We completely eliminated circular target labeling in favor of an empirically grounded, multi-step supervisory construction pipeline (`label_construction.py`):
1. **Decoupled Supervisory Grounding:** Target labels ($y$) are constructed by evaluating synthetic investor risk budgets against realized 10-year historical return, volatility, and maximum drawdown statistics derived directly from Association of Mutual Funds in India (AMFI) NAV data (`market_performance.csv`).
2. **Suitability Policy Configuration:** Financial constraints (maximum equity allocation for retirees, minimum emergency reserves, debt ratio caps) are declared transparently in `suitability_config.json`.
3. **Explicit Data Provenance:** The label construction process emits a full diagnostic report (`label_construction_report.json`) tracking target class distributions and policy filter drop rates.

## Alternatives Considered

### 1. Pure Synthetic Heuristic Labeling (Legacy Approach)
- **Pros:** Fast and simple; requires no external market dataset ingestion.
- **Cons:** Circular, scientifically ungrounded, and incapable of reflecting real asset volatility.
- **Reason for Rejection:** Circular ML methodology is fundamentally flawed.

### 2. Manual Expert Investor Annotation
- **Pros:** High quality per sample.
- **Cons:** Unscalable; expensive; subject to individual advisor biases.
- **Reason for Rejection:** Impractical for generating large-scale baseline training splits.

## Consequences

### Positive
- Supervisory target labels reflect empirical historical AMFI NAV risk-return trade-offs rather than circular rules.
- Model evaluation metrics (`train.py`) reflect true generalization against market-grounded targets.
- Documented transparently in `metadata.json` and diagnostic reports.

### Negative / Trade-Offs
- Requires ingesting and maintaining historical AMFI NAV performance statistics (`market_performance.csv`).

## References
- [label_construction.py](../../ml-service/model/label_construction.py)
- [suitability_config.json](../../ml-service/config/suitability_config.json)
- [test_label_construction.py](../../ml-service/tests/test_label_construction.py)
- [ADR-002: Deterministic Supervisory Target Construction](0002-deterministic-supervisory-target-construction.md)
- [ADR-003: Rule-Based Baseline Isolation](0003-rule-based-baseline-isolation.md)
