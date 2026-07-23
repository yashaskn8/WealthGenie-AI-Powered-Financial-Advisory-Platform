# ADR-002: Deterministic Supervisory Target Construction

## Status
Accepted

## Date
2026-07-23

## Context
When refactoring the recommendation engine away from circular self-labeling, a key design decision arose regarding label generation: should target labels constructed from investor profiles and historical NAV statistics include stochastic (random) label noise or remain purely deterministic?

In some machine learning literature, adding Gaussian or uniform label noise is suggested to simulate real-world human preference variance and prevent decision tree classifiers from over-fitting to exact mathematical boundaries. However, in automated financial systems, introducing artificial randomness into supervisory training targets has significant architectural consequences.

## Decision
We decided that supervisory target generation in `ml-service/model/label_construction.py` must remain **100% deterministic**.

We explicitly rejected adding artificial random noise to training labels for the following reasons:
1. **Auditability & Provenance:** Grounding supervisory targets in empirical NAV performance and documented suitability equations requires an unbroken, verifiable audit trail. Random label corruption breaks mathematical auditability.
2. **Reproducibility:** Deterministic target construction ensures that given identical profile data and suitability policy configurations (`suitability_config.json`), model retraining yields byte-for-byte reproducible dataset artifacts (`investment_profiles.csv`).
3. **Uncertainty Separation:** True prediction uncertainty belongs in probability calibration (ECE/MCE), model confidence thresholding, and ensemble variance estimation—not in artificial label corruption.

## Alternatives Considered

### 1. Stochastic Label Noise Perturbation ($\sigma > 0$)
- **Pros:** Smoothes hard decision boundaries; lowers raw tree training accuracy.
- **Cons:** Destroys exact reproducibility; corrupts supervisory provenance; makes experiment comparison non-deterministic.
- **Reason for Rejection:** Fails reproducible engineering standards and compromises data provenance.

### 2. Human Preference Stochastic Simulation
- **Pros:** Models random human behavioral quirks.
- **Cons:** Arbitrary noise distribution choice; unsupported by empirical transaction evidence.
- **Reason for Rejection:** Replaces deterministic policy with ungrounded random heuristics.

## Consequences

### Positive
- 100% reproducible training dataset generation across independent pipeline runs.
- Verifiable mathematical audit trail connecting profile inputs, policy configuration parameters, and target class assignments.
- Enables precise sensitivity analysis (`label_sensitivity_report.json`) by isolating policy parameter shifts from random variance.

### Negative / Trade-Offs
- The machine learning classifier learns smooth, continuous approximations of deterministic utility boundaries, resulting in high CV accuracies ($95.30\%$) on synthetic datasets.

## References
- [label_construction.py](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/ml-service/model/label_construction.py)
- [suitability_config.json](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/ml-service/config/suitability_config.json)
- [ADR-001: Elimination of Circular Labeling](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/docs/adr/0001-elimination-of-circular-labeling.md)
- [ADR-007: Reproducibility & Provenance Tracking](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/docs/adr/0007-reproducibility-and-provenance-tracking.md)
