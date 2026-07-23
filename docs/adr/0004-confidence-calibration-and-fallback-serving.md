# ADR-004: Confidence Calibration and Fallback Serving

## Status
Accepted

## Date
2026-07-23

## Context
Raw soft-max or tree-ensemble prediction probabilities from machine learning models often suffer from miscalibration—meaning a predicted class probability of $0.90$ may not correspond to an empirical accuracy of $90\%$. In financial advisory systems, serving low-confidence predictions near decision boundaries presents risk. Forcing a prediction when probability is low can result in fragile asset allocation recommendations.

## Decision
We implemented a two-part confidence calibration and fallback serving architecture:
1. **Validation-Derived Dynamic Thresholding:** During model training (`train.py`), prediction probabilities on the validation split ($X_{\text{val}}$) are analyzed. The serving confidence threshold is calibrated at the 10th percentile of validation max probabilities ($P_{\text{threshold}} = 0.8362$) and saved to `metadata.json`.
2. **Confidence Calibration Diagnostics:** Calibration quality is continuously evaluated using Expected Calibration Error ($\text{ECE} = 0.0360$ / $3.6\%$), Maximum Calibration Error ($\text{MCE} = 0.2965$), and Brier Skill Score ($0.9857$).
3. **Fallback Serving Flag (`low_confidence: true`):** In `main.py`, if a live inference prediction probability $P_{\text{max}} < P_{\text{threshold}}$, the microservice returns `low_confidence: true` in `PredictResponse`. The frontend UI (`ExplainabilityPanel.jsx` and `RecommendationDashboard.jsx`) renders a clear exploratory fallback banner notifying the user that the model has automatically fallen back to rule-based evaluation.

## Alternatives Considered

### 1. Hardcoded Probability Cutoff (e.g. Fixed 0.50)
- **Pros:** Simple to implement.
- **Cons:** Arbitrary magic number; ignores empirical validation probability distributions.
- **Reason for Rejection:** Non-calibrated and scientifically ungrounded.

### 2. Always Force Prediction Output (No Fallback)
- **Pros:** Guarantees ML output for 100% of requests.
- **Cons:** Exposes users to low-confidence edge predictions near decision boundaries.
- **Reason for Rejection:** Fails financial safety and risk mitigation requirements.

## Consequences

### Positive
- Prevents low-confidence ML predictions from being displayed as high-certainty recommendations.
- ECE of 3.6% confirms strong alignment between predicted probabilities and empirical accuracy.
- Microservice and frontend seamlessly handle low-confidence scenarios.

### Negative / Trade-Offs
- Approximately 10% of validation edge profiles trigger `low_confidence: true` fallback UI banners.

## References
- [schemas.py](../../ml-service/schemas.py)
- [main.py](../../ml-service/main.py)
- [metadata.json](../../ml-service/model/metadata.json)
- [ExplainabilityPanel.jsx](../../reactapp/src/components/ExplainabilityPanel.jsx)
- [ADR-003: Rule-Based Baseline Isolation](0003-rule-based-baseline-isolation.md)
