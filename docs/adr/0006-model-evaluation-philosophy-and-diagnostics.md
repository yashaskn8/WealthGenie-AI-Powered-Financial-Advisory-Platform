# ADR-006: Model Evaluation Philosophy and Diagnostics

## Status
Accepted

## Date
2026-07-23

## Context
Standard raw accuracy ($\frac{\text{Correct}}{\text{Total}}$) is an insufficient metric for evaluating multi-class recommendation systems. When asset categories exhibit realistic demographic class imbalances (e.g. `RBI_Bond` $50.6\%$, `Equity_MF` $26.2\%$, `ETF` $3.5\%$, `Debt_MF` $0.22\%$), a trivial majority-class classifier can achieve misleadingly high accuracy while failing completely on minority categories.

To establish scientific defensibility, an evaluation suite must report multi-class balanced metrics, cross-validation variance, calibration errors, and statistical uncertainty intervals.

## Decision
We adopted a multi-dimensional evaluation philosophy reported in `metadata.json` and model documentation:
1. **Multi-Class Performance Metrics:**
   - **Balanced Accuracy ($95.20\%$):** Unweighted average of recall across all classes, preventing majority-class distortion.
   - **Macro F1 ($0.8601$) & Weighted F1 ($0.9558$):** Measures precision-recall balance across rare and frequent classes.
   - **Matthews Correlation Coefficient ($0.9303$) & Cohen's Kappa ($0.9301$):** Evaluates multi-class agreement accounting for chance agreement.
2. **Stratified 5-Fold Cross-Validation:** Measures generalization stability across random dataset partitions ($5\text{-Fold CV Accuracy} = 0.9530 \pm 0.0023$).
3. **Non-Parametric Bootstrap 95% Confidence Intervals:** Reports uncertainty alongside point estimates (e.g. Test Accuracy $95.53\%$ with $95\%$ CI $[0.9487, 0.9610]$).
4. **Calibration Evaluation:** Expected Calibration Error ($\text{ECE} = 0.0360$) and Brier Skill Score ($0.9857$).

## Alternatives Considered

### 1. Report Test Accuracy Only
- **Pros:** Minimal complexity; easy to explain to non-technical stakeholders.
- **Cons:** Masks class imbalance collapse; ignores prediction calibration and fold variance.
- **Reason for Rejection:** Fails basic machine learning evaluation standards.

### 2. Parametric Normal Confidence Intervals
- **Pros:** Computationally cheap formula ($\pm 1.96 \cdot \text{SE}$).
- **Cons:** Assumes Gaussian error distribution, which breaks for bounded multi-class metrics.
- **Reason for Rejection:** Bootstrap resampling provides accurate non-parametric intervals.

## Consequences

### Positive
- Prevents hidden class collapse from passing unnoticed during model evaluation.
- Provides rigorous 95% confidence intervals and 5-fold cross-validation standard deviations.
- Complete transparency persisted in `metadata.json`.

### Negative / Trade-Offs
- Increases training pipeline runtime by ~15 seconds to execute cross-validation and 200 bootstrap iterations.

## References
- [train.py](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/ml-service/model/train.py)
- [metadata.json](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/ml-service/model/metadata.json)
- [generate_production_reports.py](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/ml-service/model/generate_production_reports.py)
- [model_card.md](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/ml-service/model/model_card.md)
