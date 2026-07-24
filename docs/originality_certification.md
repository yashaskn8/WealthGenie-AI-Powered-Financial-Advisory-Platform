# Task 8 — Originality Certification & Prior Art Distinction

## Executive Summary
This document provides explicit distinction between **Novel Engineering Decisions** (custom optimizations and hybrid algorithmic integrations) and **Established Engineering Prior Art** implemented within WealthGenie.

---

## 1. Categorization Matrix

| Component | Engineering Technique | Category | Prior Art Reference | Custom Novel Integration |
|:---|:---|:---:|:---|:---|
| **Projection Engine** | Halton Quasi-Monte Carlo | **Custom Integration** | Halton (1960) radical-inverse sequence | Integrated Base-2/3 Halton sequence with GBM log-normal wealth projections for API latency reduction |
| **XIRR Solver** | Hybrid Newton-Bisection-Brent | **Custom Integration** | Brent (1973) root finding | Dynamic fallback mechanism switching from Newton to bounded Bisection when $|f'(r)| < 1e-12$ |
| **ML Microservice** | TreeSHAP Explainability | **Established Engineering** | Lundberg et al. (2020) TreeSHAP | Python FastAPI endpoint serving per-request TreeSHAP feature attributions |
| **Tax Engine** | Slabs & Marginal Relief | **Established Engineering** | Indian Income Tax Act 1961 (FY25-26) | Complete Section 87A rebate & marginal cliff smoothing logic |
| **Auth System** | JWT & Redis Blacklist | **Established Engineering** | RFC 7519 / Express Middleware | Decoupled auth isolation with Redis token revocation |

---

## 2. Experimental Verification Summary

1. **Halton QMC vs PRNG**: Empirical benchmark ([server/reports/qmc_benchmark.md](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/server/reports/qmc_benchmark.md)) demonstrates 70.65% error reduction at $N = 100$ and 63.76% error reduction at $N = 1,000$.
2. **XIRR Solver Robustness**: Tested against flat derivative cash flows ([server/reports/assumption_attacks.md](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/server/reports/assumption_attacks.md)); automatically fell back to Bisection solver in 32 iterations.
3. **Horizontal Scaling**: Benchmark ([server/reports/horizontal_scaling.md](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/server/reports/horizontal_scaling.md)) verified **1.52x throughput speedup (76.21% efficiency)** under 100% identical zero-trust conditions.

---

## 3. Engineering Honesty Declaration
No claim is made of inventing fundamental mathematical theorems (Halton, TreeSHAP, Newton-Raphson, or Markowitz MPT). All engineering value stems from **deliberate algorithm selection, empirical trade-off evaluation, and resilient hybrid system integration**.
