# ADR-005: Explainability Strategy and TreeSHAP Scope

## Status
Accepted

## Date
2026-07-23

## Context
Providing transparency into asset allocation recommendations is essential for financial advisory applications. However, explainability tools in machine learning are frequently misunderstood. Marketing copy often claims that feature attribution algorithms (such as SHAP or LIME) prove "causality", "recommendation correctness", or "financial advice validity".

In reality, SHAP (Shapley Additive exPlanations) measures feature contributions to a model's prediction probability relative to base expected values. It explains *what features the model relied on to make a prediction*, not *whether the investment is guaranteed to perform well*.

## Decision
We adopted **TreeSHAP** (`shap.TreeExplainer`) as the core explainability engine, while establishing strict boundaries on its interpretation:
1. **Scope Definition:** TreeSHAP computes exact Shapley values for the tree-based ensemble (`RandomForestClassifier`), showing how inputs (Age, Income, Debt Ratio, Horizon) shift the output class probability.
2. **UI & Documentation Reframing:** In `ExplainabilityPanel.jsx`, UI titles and badges were updated to *"NAV Performance Model Factor Attribution"*. Subtitles explicitly disclose: *"Feature contributions below represent TreeSHAP values for a classifier trained on historical AMFI NAV performance statistics."*
3. **Explicit Non-Claims:** Documentation and UI tooltips explicitly disclose that TreeSHAP does **NOT** establish:
   - Causal financial relationships;
   - Guaranteed investment return suitability;
   - Superiority over human advisory or rule baselines.

## Alternatives Considered

### 1. Global Feature Importance Only (Gini Impurity / Permutation)
- **Pros:** Fast and lightweight.
- **Cons:** Gives one global number per feature; cannot explain individual user recommendations.
- **Reason for Rejection:** Insufficient for personalized profile explanations.

### 2. LIME (Local Interpretable Model-agnostic Explanations)
- **Pros:** Model-agnostic.
- **Cons:** Sampling instability; slower runtime; approximate local linear surrogate.
- **Reason for Rejection:** TreeSHAP provides exact, deterministic Shapley values for tree ensembles.

## Consequences

### Positive
- Users receive exact, per-profile feature contribution breakdowns in under 10 ms.
- Clear disclosures protect against over-reliance and misleading causality claims.
- Permutation feature importance (`feature_importance_report.json`) provides global validation alongside local TreeSHAP.

### Negative / Trade-Offs
- Requires computing matrix SHAP values during `/predict/enriched` microservice calls.

## References
- [ExplainabilityPanel.jsx](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/reactapp/src/components/ExplainabilityPanel.jsx)
- [main.py](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/ml-service/main.py)
- [feature_importance_report.json](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/ml-service/reports/feature_importance_report.json)
- [model_card.md](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/ml-service/model/model_card.md)
