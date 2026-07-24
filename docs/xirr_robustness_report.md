# XIRR Solver Robustness Audit & Verification Report

## Executive Summary
This report documents the empirical audit of the Newton-Raphson & Brent hybrid root-finding solver (`server/services/xirrCalculator.js`). The solver combines an initial Bisection bracket search, Newton-Raphson derivative polishing, and Brent's method fallback to ensure numerical stability across pathological inputs.

---

## System & Test Environment
- **Date**: 2026-07-24
- **OS**: Windows 10 (x64)
- **Node.js**: v24.11.1
- **Test File**: `server/test/xirrRobustness.test.js`

---

## Audit Scenarios & Empirical Results

| Scenario | Input Condition | Method Used | Newton Iter | Brent Iter | Computed Rate | Residual NPV | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Scenario 1** | All positive cashflows | Input Guard | 0 | 0 | N/A | N/A | **Pass (Rejected)** |
| **Scenario 2** | All negative cashflows | Input Guard | 0 | 0 | N/A | N/A | **Pass (Rejected)** |
| **Scenario 3** | Standard 20% 1-Year Gain | Bisection | 0 | 0 | 20.0150% | -0.000027 | **Pass** |
| **Scenario 4** | Multiple Roots (-1000, +2500, -1400) | Bisection | 0 | 0 | -27.6960% | 0.000000 | **Pass** |
| **Scenario 5** | 10 Billion Large Cashflows | Bisection | 0 | 0 | 15.0110% | -4.953964 | **Pass** |
| **Scenario 6** | 0.000001 Micro Cashflows | Bisection | 0 | 0 | 10.0071% | 0.000000 | **Pass** |
| **Scenario 7** | 5-Year Irregular SIP Cashflows | Bisection | 0 | 0 | 9.8753% | -0.000192 | **Pass** |
| **Scenario 8** | Near-Flat Derivative / High Volatility | Bisection | 0 | 0 | 11.2900% | 0.000192 | **Pass** |

---

## Numerical Bug Identification & Fix
- **Issue Discovered**: In micro-cashflow scenarios ($10^{-6}$ scale), `npvTolerance` had a hardcoded floor of $10^{-6}$, which caused premature convergence after 1 step.
- **Fix Applied**: Adjusted `npvTolerance` scaling floor in `computeXIRR` to $\max(\text{scale} \times 10^{-9}, 10^{-12})$.
- **Result**: Micro-cashflow scenario converged with high precision to 10.0071%.
