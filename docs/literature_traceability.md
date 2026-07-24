# Literature Traceability & Prior Art Mapping — Task 3

## Overview
This document traces every signature technical algorithm in WealthGenie to foundational academic literature, industry standards, and regulatory guidance, detailing standard approaches, implementation mappings, intentional deviations, and trade-off rationales.

---

### 1. Halton Quasi-Monte Carlo Simulation
- **Academic Foundation**: Halton, J. H. (1960). *On the efficiency of certain quasi-random sequences of points in evaluating multi-dimensional integrals*. Numerical Mathematik, 2(1), 84-90.
- **Standard Approach**: Naive Monte Carlo using pseudo-random number generators ($O(N^{-1/2})$ convergence rate).
- **Implementation Mapping**: Base-2 and Base-3 radical inverse sequence generator in [monteCarloEngine.js](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/server/services/monteCarloEngine.js#L14-L24).
- **Intentional Deviation**: Uses Halton low-discrepancy sequences instead of standard PRNG Box-Muller sampling.
- **Rationale**: Achieves $O((\log N)^d / N)$ deterministic error reduction, reducing sample count from 10,000 to 1,000 for sub-50ms API response latency.
- **Trade-off**: Higher correlation in dimensions $d > 10$. Acceptable for WealthGenie's 4–6 asset class portfolios.

---

### 2. Exact TreeSHAP Explainability
- **Academic Foundation**: Lundberg, S. M., et al. (2020). *From local explanations to global understanding with explainable AI for trees*. Nature Machine Intelligence, 2(1), 56-67.
- **Standard Approach**: Feature gain importance or LIME local linear approximations.
- **Implementation Mapping**: `TreeExplainer` in [ml-service/explainer.py](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/ml-service/explainer.py).
- **Intentional Deviation**: Uses exact TreeSHAP instead of approximate KernelSHAP or feature permutation.
- **Rationale**: Guarantees game-theoretic efficiency, symmetry, and additivity without non-deterministic perturbation sampling.
- **Trade-off**: Tied strictly to tree-based models (RandomForest).

---

### 3. Modern Portfolio Theory (MPT) Asset Allocation
- **Academic Foundation**: Markowitz, H. (1952). *Portfolio Selection*. The Journal of Finance, 7(1), 77-91.
- **Standard Approach**: Static rule of thumb (e.g. "100 minus age in equities").
- **Implementation Mapping**: Minimum-variance portfolio optimizer and rebalancing drift engine in `server/services/portfolioEngine.js`.
- **Intentional Deviation**: Integrates Indian SEBI/AMFI regulatory caps (e.g., maximum equity limits for senior citizens, mandatory liquid emergency fund allocation).
- **Rationale**: Prevents pure mathematical optimization from recommending regulatory-noncompliant allocations.

---

### 4. Hybrid Root-Finding XIRR Solver
- **Academic Foundation**: Brent, R. P. (1973). *Algorithms for Minimization without Derivatives*. Prentice-Hall.
- **Standard Approach**: Single-method Newton-Raphson or Excel internal IRR function.
- **Implementation Mapping**: Hybrid Newton-Raphson + Bisection + Brent solver in [xirrCalculator.js](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/server/services/xirrCalculator.js).
- **Intentional Deviation**: Switches dynamically from Newton-Raphson to bounded Bisection and Brent's method when derivative $|f'(r)| < 1e-12$.
- **Rationale**: Eliminates division-by-zero crashes and infinite loops on pathological cash flows.
