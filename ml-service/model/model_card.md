# Model Card: WealthGenie Asset Allocation Recommender

## Model Details
- **Model Name:** RandomForestClassifier (Asset Allocation Microservice)
- **Model Version:** 3.0.0
- **Trained At:** 2026-07-23
- **Primary Objective:** Provide supervised multi-factor asset class recommendations based on investor profile parameters (age, income, savings, debt, dependents, emergency fund, horizon, risk capacity).

---

## Data Provenance & Supervisory Target Construction

### External Historical NAV Data Source
- **Data Source:** Public AMFI daily NAV history via TigZig open data API (`build_dataset.py`).
- **Covered Asset Classes:** Equity MFs (Flexi/Large/Mid Cap), ELSS, Index ETFs, Debt/Liquid MFs, Bank FDs, and Sovereign RBI Bonds.
- **Metrics Extracted:** Realized annualized return, annualized volatility, 3-year max drawdown, and 3-year trailing Sortino ratio.

### Historically Derived Supervisory Targets
Supervisory training targets are constructed by a dedicated module (`label_construction.py`) that applies explicitly documented portfolio suitability principles to normalized NAV performance metrics:
- Investor risk capacity (derived from age, debt load, dependents burden, emergency fund adequacy, and horizon) defines acceptable volatility and drawdown risk budgets.
- High risk capacity and long horizon profiles match high-realized-return categories (ELSS, Equity MFs).
- Low risk capacity or short horizon profiles match low-volatility categories (Debt MFs, Bank FDs, RBI Bonds).

---

## Scientific Principles & Supervision Invariants

### 1. Intentional Deterministic Supervision
- Supervisory targets are generated deterministically from documented suitability principles applied to normalized NAV metrics.
- Artificial random label noise is **explicitly rejected**: corrupting labels with random noise reduces reproducibility, weakens auditability, produces inconsistent retraining runs, and corrupts supervision provenance.

### 2. Multi-Class Diversity & Reachability
- All 6 target categories (`Equity_MF`, `ELSS`, `ETF`, `Debt_MF`, `FD`, `RBI_Bond`) are demonstrably reachable across valid investor profile demographics.
- Reachability and maximum class dominance (<65%) are enforced by automated integration tests (`test_label_construction.py`).

---

## Methodological Limitations

- **Supervisory Target Origin:** Supervisory targets are historically constructed training labels derived from normalized NAV statistics and documented portfolio suitability principles. They do NOT represent observed real-world investor transactions or human advisor decisions.
- **Constructed Targets vs Ground Truth:** Targets combine empirical NAV performance evidence with suitability assumptions. They are not independently observed human transactions.
- **Non-Stationary Markets:** Future market conditions, interest rate environments, and asset class returns may diverge significantly from historical NAV performance.
- **NAV Data Coverage Limits:** Model capabilities are strictly bounded by the number, historical window duration, and asset class coverage of public AMFI NAV schemes included in `market_performance.csv`.

---

## Quantitative Analysis & Honest Baseline Comparison

### Model Test Diagnostics vs Demoted Heuristic Baseline
The trained RandomForest model is evaluated against the demoted handwritten rule heuristic (`assign_target_instruments()`) on the identical held-out test split (20% of dataset):

- **Test Accuracy:** `0.9557` (95.57%)
- **Balanced Accuracy:** `0.9520` (95.20%)
- **Macro F1 Score:** `0.9535`
- **Weighted F1 Score:** `0.9542`
- **Matthews Correlation Coefficient (MCC):** `0.9381`
- **Cohen's Kappa:** `0.9380`
- **Demoted Baseline Accuracy:** `0.2802`
- **Model vs Baseline Target Agreement Delta:** `+0.6755` (+67.55%)

> **Important Interpretation Note:** The accuracy delta measures how closely the retrained ML model reproduces the new NAV-derived suitability targets relative to the legacy cutoff rules. It does **NOT** measure investment return improvement or financial outcome superiority.

- **Serving Confidence Threshold:** Calibrated dynamically at the 10th percentile of validation-set prediction probabilities (`0.8695`, persisted in `metadata.json`). Predictions falling below this threshold trigger a `low_confidence: true` flag, causing the microservice and frontend to fall back to rule-based explanations.

---

## TreeSHAP Explainability Scope

TreeSHAP (Shapley Additive exPlanations) attributes feature contributions (e.g., Age, Income, Debt Ratio) to the model's prediction probability relative to base expected values.

TreeSHAP does NOT establish:
- Causal financial relationships;
- Guaranteed investment suitability;
- Recommendation correctness;
- Superiority over the heuristic baseline.
