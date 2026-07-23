# ADR-009: Production Monitoring and Drift Readiness

## Status
Accepted

## Date
2026-07-23

## Context
Deploying machine learning models in production requires robust infrastructure to detect feature drift (changes in incoming investor demographic distributions) and concept drift (changes in underlying market performance or suitability policy rules). Without baseline reference distributions, detecting performance degradation or knowing when to trigger model retraining is impossible.

## Decision
We established a drift detection reference infrastructure:
1. **Reference Distribution Export (`reference_distribution.json`):** During training, `generate_production_reports.py` automatically computes and persists baseline statistical metrics (mean, std, 25th, 50th, 75th percentiles) for all 16 canonical features, alongside target category probabilities.
2. **Monitoring Metrics:** Infrastructure supports monitoring Population Stability Index (PSI) for numerical features, Wasserstein Distance for probability distributions, and Chi-Square tests for categorical demographic shifts.
3. **Automated Retraining Triggers:** Defined retraining policies in `model_card.md`:
   - Scheduled quarterly retraining to incorporate updated AMFI NAV performance statistics.
   - Event-driven retraining triggered when feature drift $\text{PSI} > 0.25$ or when serving fallback rate exceeds $15\%$.

## Alternatives Considered

### 1. Ad-Hoc Manual Retraining
- **Pros:** No monitoring infrastructure required initially.
- **Cons:** Fails to detect silent model degradation; prone to stale model serving.
- **Reason for Rejection:** Non-viable for production ML systems.

### 2. Full Online Retraining on Every Request
- **Pros:** Real-time updates.
- **Cons:** High computational cost; vulnerable to feedback loops and catastrophic forgetting.
- **Reason for Rejection:** Unstable and computationally wasteful.

## Consequences

### Positive
- `reference_distribution.json` provides an immutable baseline for future production drift monitoring tools (Evidently AI, Great Expectations).
- Quantifiable triggers defined for scheduled and drift-driven model retraining.

### Negative / Trade-Offs
- Requires persisting reference distribution artifacts alongside model binaries.

## References
- [reference_distribution.json](../../ml-service/reports/reference_distribution.json)
- [generate_production_reports.py](../../ml-service/model/generate_production_reports.py)
- [model_card.md](../../ml-service/model/model_card.md)
- [ADR-008: Synthetic Data Limitations and Real-World Gap](0008-synthetic-data-limitations-and-real-world-gap.md)
