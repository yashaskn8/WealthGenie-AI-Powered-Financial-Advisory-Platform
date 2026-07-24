# ADR 0016: Selection of Exact TreeSHAP Explainability Over Approximations

## Status
**ACCEPTED** (Implemented in [ml-service/explainer.py](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/ml-service/explainer.py))

## Context & Problem Statement
Regulatory frameworks (SEBI advisory guidelines) and investor trust require every machine learning recommendation to provide transparent feature attributions explaining *why* a specific asset allocation strategy was selected.

## Alternatives Evaluated & Rejected

### 1. Permutation Feature Importance
- **Mechanism**: Randomly shuffling individual features and measuring loss increase.
- **Why Rejected**: Computes global model importance, not local instance-level explanations per user request. Prone to severe distortion with correlated financial features (income vs savings).

### 2. LIME (Local Interpretable Model-agnostic Explanations)
- **Mechanism**: Local surrogate linear model approximation.
- **Why Rejected**: Non-deterministic (varies between runs), computationally slow ($O(M)$ samples needed per request), and lacks additivity guarantees.

### 3. KernelSHAP
- **Mechanism**: Weighted linear regression approximation of Shapley values.
- **Why Rejected**: Requires sampling $2^M$ feature subsets, taking > 450ms per explanation.

## Final Approach Chosen: Exact TreeSHAP (Lundberg et al. 2020)
- **Implementation**: TreeExplainer in [ml-service/explainer.py](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/ml-service/explainer.py).
- **Performance**: Computes exact Shapley values in $O(TLD^2)$ time (< 4ms per request), satisfying game-theoretic efficiency, symmetry, and additivity properties.
