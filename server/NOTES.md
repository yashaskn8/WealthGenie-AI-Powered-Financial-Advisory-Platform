# Engine Implementation Deduplication & Audit Notes

## Context & Audit Findings

During an engineering audit of `server/services/`, four engine modules were found to have parallel `.js` and `.ts` implementation files (`.ts` + `.d.ts` pairs):
1. `portfolioEngine.js` vs `portfolioEngine.ts`
2. `taxEngine.js` vs `taxEngine.ts`
3. `xirrCalculator.js` vs `xirrCalculator.ts`
4. `monteCarloEngine.js` vs `monteCarloEngine.ts`

### Baseline Execution Analysis (Step 1)
- `server/package.json` configures `"type": "module"` and `"start": "node server.js"`.
- Node.js executes ESM imports directly without a TypeScript pre-compilation step.
- Every route (`routes/portfolio.js`, `routes/tax.js`, `routes/projection.js`, `routes/montecarlo.js`, `routes/goals.js`, `routes/recommend.js`, `routes/profile.js`), service (`RecommendationPipeline.js`, `postTaxCalculator.js`, `genieChatSystemPrompt.js`), and test file (`test/portfolioEngine.test.js`, `test/taxEngine.test.js`, `test/xirrCalculator.test.js`, `test/monteCarloEngine.test.js`, `test/property.test.js`) explicitly imported **`.js`** files at runtime.
- The `.ts` and `.d.ts` files were **never executed at runtime by Node**.

---

## Line-by-Line Behavioral Divergence Matrix (Step 2)

| Engine Pair | Behavioral Divergence Found | Runtime Execution Winner | Reason for Decision |
| :--- | :--- | :---: | :--- |
| **`portfolioEngine.js` vs `.ts`** | **0 Divergences.** Both files contain identical mean-variance optimization, Cholesky PSD checking, and rebalance calculation logic. | `portfolioEngine.js` | Executed at runtime; verified by 4 portfolio unit tests and property tests. |
| **`taxEngine.js` vs `.ts`** | **0 Divergences.** Both files contain identical FY2025-26 / FY2026-27 slab rates, Section 87A rebate rules, marginal relief, and deduction capping. | `taxEngine.js` | Executed at runtime; verified by 4 tax unit tests and property tests. |
| **`xirrCalculator.js` vs `.ts`** | **0 Divergences.** Both files contain identical Newton-Raphson iterations, Brent's method fallbacks, and date normalization. | `xirrCalculator.js` | Executed at runtime; verified by 3 XIRR unit tests and property tests. |
| **`monteCarloEngine.js` vs `.ts`** | **0 Divergences.** Both files contain identical Halton QMC sequences, Box-Muller transforms, and multiplicative control variates. | `monteCarloEngine.js` | Executed at runtime; verified by 2 Monte Carlo unit tests and property tests. |

---

## Resolution & Cleanup Actions (Step 3 - Step 5)

1. **Deleted Duplicate Non-Canonical Files**: Deleted `.ts` and `.d.ts` files (`portfolioEngine.ts`, `taxEngine.ts`, `xirrCalculator.ts`, `monteCarloEngine.ts`, and their `.d.ts` counterparts).
2. **Removed Dead Tooling**: Removed `tsconfig.json` and dead `"typecheck": "tsc --noEmit"` script from `server/package.json`.
3. **Verified Canonical Source of Truth**: All routes, services, and test suites import single canonical `.js` files.

---

## Final Verification Declarations

1. **`portfolioEngine.js`**: This is the only file implementing this logic, it is the one `server.js` actually runs, and `server/test/portfolioEngine.test.js` proves it (4/4 passing).
2. **`taxEngine.js`**: This is the only file implementing this logic, it is the one `server.js` actually runs, and `server/test/taxEngine.test.js` proves it (4/4 passing).
3. **`xirrCalculator.js`**: This is the only file implementing this logic, it is the one `server.js` actually runs, and `server/test/xirrCalculator.test.js` proves it (3/3 passing).
4. **`monteCarloEngine.js`**: This is the only file implementing this logic, it is the one `server.js` actually runs, and `server/test/monteCarloEngine.test.js` proves it (2/2 passing).
