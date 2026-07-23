# ADR-010: Ethical and Responsible AI Deployment

## Status
Accepted

## Date
2026-07-23

## Context
Automated asset allocation recommendation systems interact directly with retail investor wealth. Incorrect, overconfident, or biased recommendations can cause real financial harm. It is vital to define the legal, ethical, and operational boundaries of the WealthGenie system to ensure responsible deployment.

## Decision
We established strict ethical guidelines, financial disclaimers, and human oversight controls across system interfaces:
1. **Decision-Support Tooling Contract:** WealthGenie is explicitly defined as an *educational decision-support and financial analysis tool*, not an autonomous discretionary wealth manager or certified investment advisor (SEBI RIA).
2. **Fairness Transparency Diagnostics (`fairness_diagnostics_report.json`):** Systematically tracks recommendation distributions across age groups ($<30$, $30-50$, $50+$) and income tiers ($<8\text{L}$, $8\text{L}-20\text{L}$, $>20\text{L}$) to ensure low-income or senior demographics receive appropriate low-volatility recommendations (e.g. RBI Bonds / FDs).
3. **Mandatory Human-in-the-Loop Disclaimers:** All API responses (`schemas.py`) and UI views (`ExplainabilityPanel.jsx`) include clear disclaimers that output recommendations are model projections based on historical NAV statistics and suitability policy rules, and should be reviewed by a certified human financial planner prior to capital allocation.
4. **Out-of-Scope Use Cases:** Explicitly prohibited from high-frequency trading, automated order execution without user approval, or leverage-based derivative strategies.

## Alternatives Considered

### 1. Fully Autonomous Investment Execution
- **Pros:** High user automation.
- **Cons:** Regulatory violation; severe fiduciary risk; high probability of user harm during market crashes.
- **Reason for Rejection:** Regulatory non-compliance and unethical risk exposure.

### 2. Omit Demographic Fairness Auditing
- **Pros:** Less code and testing required.
- **Cons:** Blindness to potential age or income bias in suitability rules.
- **Reason for Rejection:** Violates responsible AI engineering principles.

## Consequences

### Positive
- Transparent boundary definitions protect retail users from over-reliance on automated predictions.
- Demographic fairness diagnostics ensure suitability rules perform safely across vulnerable demographic groups.
- Complies with regulatory decision-support requirements.

### Negative / Trade-Offs
- Requires user confirmation steps before any portfolio rebalancing or allocation execution.

## References
- [fairness_diagnostics_report.json](../../ml-service/reports/fairness_diagnostics_report.json)
- [model_card.md](../../ml-service/model/model_card.md)
- [ExplainabilityPanel.jsx](../../reactapp/src/components/ExplainabilityPanel.jsx)
- [ADR-004: Confidence Calibration and Fallback Serving](0004-confidence-calibration-and-fallback-serving.md)
