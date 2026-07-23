# ADR-001: Elimination of Circular Labeling

## Status
Accepted

## Date
2026-07-23

## Context
The legacy implementation of WealthGenie's asset allocation model in `ml-service/model/train.py` contained a self-referential training loop:
1. Synthetic investor profile features were generated via `generate_correlated_dataset()`.
2. A handwritten Python function (`assign_target_instruments()`) applied heuristic rules to assign primary recommendation targets to those profiles.
3. A `RandomForestClassifier` was trained on the synthetic features to predict the output of `assign_target_instruments()`.
4. Explainability tools (TreeSHAP) were used to explain the classifier's predictions.

This setup suffered from circular labeling: the machine learning model was not discovering patterns from external financial evidence or real-world outcomes; rather, it was acting as a lossy compressor for a handwritten `if/else` rule block written by the developer. Evaluating a classifier trained on its author's rules yields inflated accuracy metrics (e.g. 56% to 99% agreement with the developer's rules) and misrepresents rule memorization as machine intelligence.

## Decision
We eliminated circular labeling by decoupling target generation from handwritten heuristics:
1. Introduced a dedicated, non-circular supervisory label construction module (`ml-service/model/label_construction.py`).
2. Supervisory target labels are derived from realized AMFI daily NAV market performance statistics (`market_performance.csv`) and documented portfolio suitability principles loaded from a versioned configuration file (`suitability_config.json`).
3. Demoted `assign_target_instruments()` strictly to an isolated baseline rule heuristic used for test set benchmarking and low-confidence fallback serving.
4. Enforced zero circularity via automated Abstract Syntax Tree (AST) static analysis tests (`test_label_construction.py`) that verify `train.py` and `label_construction.py` contain zero imports or calls to `assign_target_instruments()`.

## Alternatives Considered

### 1. Continue Using Heuristic Labels
- **Pros:** Zero dataset generation complexity; trivial implementation.
- **Cons:** Scientifically fraudulent; classifier simply memorizes developer code; TreeSHAP explains rule memorization rather than market evidence.
- **Reason for Rejection:** Rejection was mandatory to establish scientific validity.

### 2. Hybrid Heuristic / ML Rule Blending
- **Pros:** Allows partial integration of developer domain knowledge.
- **Cons:** Obscures data provenance; hard to quantify how much supervision stems from heuristics versus market data.
- **Reason for Rejection:** Fails anti-circularity verification and compromises auditability.

### 3. Manual Profile Relabeling by Financial Advisors
- **Pros:** Provides human expert annotations.
- **Cons:** High cost; poor scalability; introduces subjective annotator bias without objective return/volatility grounding.
- **Reason for Rejection:** Impractical for generating 20,000 synthetic profile targets repeatably.

## Consequences

### Positive
- Fully auditable data provenance: labels are grounded in empirical AMFI NAV performance metrics.
- Complete separation of policy configuration from core algorithm implementation.
- Automated AST call-graph static analysis guarantees anti-circularity during CI/CD execution.

### Negative / Trade-Offs
- Requires maintaining external NAV ingestion pipelines (`build_dataset.py`) and suitability policy configurations (`suitability_config.json`).

## References
- [label_construction.py](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/ml-service/model/label_construction.py)
- [suitability_config.json](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/ml-service/config/suitability_config.json)
- [test_label_construction.py](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/ml-service/tests/test_label_construction.py)
- [ADR-002: Deterministic Supervisory Target Construction](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/docs/adr/0002-deterministic-supervisory-target-construction.md)
- [ADR-003: Rule-Based Baseline Isolation](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/docs/adr/0003-rule-based-baseline-isolation.md)
