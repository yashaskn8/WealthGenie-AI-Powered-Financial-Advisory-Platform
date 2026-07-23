# ADR-002: Deterministic Supervisory Target Construction

## Status
Accepted

## Date
2026-07-23

## Context
When training recommendation models, target label generation must be deterministic, auditable, and isolated from stochastic noise. If label generation incorporates random perturbations or unseeded noise, model training becomes non-reproducible, complicating performance debugging and model compliance audits.

## Decision
We implemented a strictly deterministic target label construction architecture in `label_construction.py`:
1. **Deterministic Target Mapping:** Given an investor feature vector $x$ and historical AMFI NAV performance statistics, the target mapping algorithm produces a deterministic asset allocation label $y \in \{\text{Equity\_MF}, \text{Debt\_MF}, \text{Hybrid\_MF}, \text{ELSS}, \text{Gold\_ETF}, \text{FD\_Bond}\}$.
2. **Fixed Random Seeds:** Synthetic profile feature generation pins random seeds (`np.random.seed(42)`), guaranteeing byte-for-byte identical dataset generation across test runs.
3. **Audit Logging:** Every dataset generation run outputs `market_performance_coverage.json` verifying that 100% of target asset classes map to historical AMFI NAV statistics.

## Alternatives Considered

### 1. Stochastic Noise Injection During Target Labeling
- **Pros:** Simulates human advisor disagreement variance.
- **Cons:** Destroys training reproducibility; makes model metrics non-deterministic.
- **Reason for Rejection:** Fails reproducibility and audit requirements.

## Consequences

### Positive
- 100% reproducible training datasets across environments.
- Enforced via unit tests in `test_label_construction.py`.

### Negative / Trade-Offs
- Does not model random human advisor decision noise.

## References
- [label_construction.py](../../ml-service/model/label_construction.py)
- [suitability_config.json](../../ml-service/config/suitability_config.json)
- [ADR-001: Elimination of Circular Labeling](0001-elimination-of-circular-labeling.md)
- [ADR-007: Reproducibility & Provenance Tracking](0007-reproducibility-and-provenance-tracking.md)
