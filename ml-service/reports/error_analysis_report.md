# Automated Error Analysis & Diagnostic Report

## 1. Executive Summary
- **Overall Model Test Accuracy:** 0.9553
- **Strongest Performing Category:** `RBI_Bond` (F1-score: 0.9754)
- **Weakest Performing Category:** `Debt_MF` (F1-score: 0.7059)

---

## 2. Category Performance Matrix

| Target Category | Precision | Recall | F1-Score | Support |
| :--- | :---: | :---: | :---: | :---: |
| `Debt_MF` | 0.7500 | 0.6667 | 0.7059 | 9.0 |
| `ELSS` | 0.9185 | 0.9675 | 0.9424 | 769.0 |
| `ETF` | 0.7500 | 0.9000 | 0.8182 | 140.0 |
| `Equity_MF` | 0.9702 | 0.9295 | 0.9494 | 1050.0 |
| `FD` | 0.8333 | 0.7143 | 0.7692 | 7.0 |
| `RBI_Bond` | 0.9810 | 0.9699 | 0.9754 | 2025.0 |

---

## 3. Confusion Matrix Breakdown

| Actual \ Predicted | `Debt_MF` | `ELSS` | `ETF` | `Equity_MF` | `FD` | `RBI_Bond` |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `Debt_MF` | 6 | 0 | 0 | 0 | 0 | 3 |
| `ELSS` | 0 | 744 | 0 | 11 | 0 | 14 |
| `ETF` | 0 | 0 | 126 | 12 | 0 | 2 |
| `Equity_MF` | 0 | 33 | 24 | 976 | 0 | 17 |
| `FD` | 0 | 0 | 0 | 0 | 5 | 2 |
| `RBI_Bond` | 2 | 33 | 18 | 7 | 1 | 1964 |

---

## 4. Key Failure Patterns & Recommendation Directives
1. **Mid-Horizon Border Discrepancies:** Confusion occurs predominantly between `Equity_MF` and `ETF` near the 3-5 year horizon transition point.
2. **Confidence-Gated Serving:** Low-confidence edge predictions ($P < 0.8695$) automatically trigger rule-based fallback serving in production to prevent fragile edge calls.
