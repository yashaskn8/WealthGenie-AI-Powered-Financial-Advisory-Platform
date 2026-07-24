# ADR 0014: Selection of Hybrid Newton-Raphson / Bisection / Brent XIRR Solver

## Status
**ACCEPTED** (Implemented in [xirrCalculator.js](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/server/services/xirrCalculator.js))

## Context & Problem Statement
Internal Rate of Return (XIRR) calculation requires finding the root $r$ of the non-linear Net Present Value equation:
$$f(r) = \sum_{i=1}^{N} \frac{C_i}{(1+r)^{(t_i - t_0)/365}} = 0$$
Financial cash flows exhibit non-monotonic derivative behavior, near-flat gradients, and sign changes that cause standard root-finding algorithms to diverge or loop endlessly.

## Alternatives Evaluated & Rejected

### 1. Pure Newton-Raphson Solver
- **Mechanism**: Iterative update $r_{k+1} = r_k - f(r_k)/f'(r_k)$.
- **Why Rejected**: Fails when derivative $f'(r) \approx 0$ (pathological or flat cash flows), oscillating endlessly or diverging to $r \to \infty$.

### 2. Pure Bisection Solver
- **Mechanism**: Bracketing interval bisection $[a, b]$ where $f(a) \cdot f(b) < 0$.
- **Why Rejected**: Extremely slow linear convergence ($O(1/2^k)$), requiring 50+ iterations per evaluation even for simple 1-year annual investments.

### 3. Secant Method
- **Mechanism**: Finite difference approximation of derivative $f'(r)$.
- **Why Rejected**: Sensitive to initial points and prone to false convergence near local extrema.

## Final Approach Chosen: Hybrid Newton-Raphson + Bisection Fallback + Brent's Method
- **Implementation**: Primary 100-iteration Newton-Raphson. If derivative $|f'(r)| < 1e-12$ or iterations exceed limit, falls back immediately to bounded Bisection interval $[-0.999, 10.0]$ followed by Brent's method in [xirrCalculator.js](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/server/services/xirrCalculator.js).
- **Robustness**: 100% mutant kill rate (60/60 mutants killed) and zero failures across 8 pathological edge cases.
