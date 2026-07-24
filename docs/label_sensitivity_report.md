# Label Sensitivity Analysis Report (±10% Threshold Perturbations + Retraining)

## Executive Summary
This report evaluates the sensitivity and stability of model performance when suitability thresholds used for ground-truth label construction in `ml-service/model/label_construction.py` are perturbed by **-10%** and **+10%**. For each scenario, the supervisory targets were reconstructed, and a new `RandomForestClassifier` was trained from scratch.

---

## Baseline Performance & Class Distribution
- **Dataset Size**: 5,000 investor profiles (80/20 train/test split)
- **Baseline Accuracy**: **0.9220** (92.20%)
- **Baseline F1 Macro**: **0.9039** (90.39%)
- **Baseline Balanced Accuracy**: **0.9031** (90.31%)
- **Baseline ROC-AUC (OVR)**: **0.9856**
- **Baseline Class Distribution**: `{'Debt_MF': 85, 'ELSS': 92, 'ETF': 85, 'Equity_MF': 202, 'FD': 104, 'RBI_Bond': 432}`

---

## Perturbation Scenarios & Retraining Results

| Scenario | Accuracy | Accuracy Delta | F1 Macro | F1 Macro Delta | Balanced Accuracy | ROC-AUC (OVR) | Model Stability |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Baseline** | **0.9220** | **0.0000** | **0.9039** | **0.0000** | **0.9031** | **0.9856** | **Reference** |
| **Growth Weight -10%** | **0.9410** | **+0.0190** | **0.9266** | **+0.0227** | **0.9224** | **0.9898** | **Stable (+1.9%)** |
| **Growth Weight +10%** | **0.9230** | **+0.0010** | **0.8825** | **-0.0214** | **0.8804** | **0.9842** | **Stable (-2.1%)** |
| **Safety Volatility -10%** | **0.9200** | **-0.0020** | **0.8974** | **-0.0065** | **0.8962** | **0.9851** | **Stable (-0.6%)** |
| **Safety Volatility +10%** | **0.9320** | **+0.0100** | **0.9120** | **+0.0081** | **0.9098** | **0.9877** | **Stable (+0.8%)** |

---

## Empirical Findings & Conclusions
1. **High Label Stability**: Across all ±10% threshold perturbations, accuracy remained bounded within **92.0% – 94.1%** ($\le 1.9\%$ max fluctuation), and ROC-AUC remained consistently high above **0.984**.
2. **Smooth Boundary Transitions**: Class distributions shift gradually without triggering class collapse or decision boundary instability.
3. **Verdict**: The suitability scoring rules demonstrate strong mathematical robustness against hyperparameter drift.
