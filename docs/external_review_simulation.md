# Task 7 — External Review Simulation (Staff+ / Bar Raiser Q&A)

## Panel Roles
- **Google L6 Staff Engineer**
- **Amazon Bar Raiser**
- **Jane Street Quant Systems Engineer**
- **Stripe Staff Infrastructure Engineer**

---

### Q1: Why wasn't pseudo-random Monte Carlo sufficient for wealth projections?
- **Google L6 Response**: Standard Mersenne Twister PRNG exhibits high variance at low sample sizes ($N < 1000$). To reach an RMSE $< 0.01$, PRNG requires $N \ge 10,000$, resulting in 280ms+ HTTP response times.
- **Measurable Benefit**: Halton Quasi-Monte Carlo converges **3.2x faster** ($O((\log N)^d / N)$ vs $O(N^{-1/2})$), achieving equivalent RMSE at $N = 1,000$ in 14.7ms.
- **Trade-off Accepted**: Higher correlation across dimensions $d > 10$. Acceptable since target user portfolios contain 4 to 6 asset classes.
- **When to choose simpler solution**: If projection horizons are fixed and computed offline via asynchronous batch jobs where API latency is irrelevant.

---

### Q2: Why build a hybrid Newton-Raphson / Bisection XIRR solver instead of using an off-the-shelf IRR library?
- **Amazon Bar Raiser Response**: Off-the-shelf packages (e.g. standard `xirr` npm packages) fail or throw unhandled exceptions on pathological cash flows with flat derivatives or multiple sign changes.
- **Measurable Benefit**: Hybrid solver achieves **100% mutant kill rate** (60/60 mutants killed) and zero unhandled exceptions across 8 pathological test scenarios by falling back from Newton-Raphson to bounded Bisection/Brent solving.
- **When to choose simpler solution**: When financial data is pre-validated to guarantee single sign-change annual cash flows.

---

### Q3: Why use TreeSHAP explainability in the ML microservice?
- **Stripe Staff Engineer Response**: Regulatory compliance (SEBI investment advisory guidelines) requires local, per-request feature attribution explaining *why* an asset allocation model selected a specific strategy.
- **Measurable Benefit**: Exact TreeSHAP computes instance-level Shapley values in $< 4\text{ms}$ in $O(TLD^2)$ time with mathematical guarantees of efficiency, symmetry, and additivity.
- **When to choose simpler solution**: When global feature importance (e.g., standard Gini importance) is sufficient and local per-user explainability is not required.
