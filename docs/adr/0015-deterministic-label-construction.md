# ADR 0015: Selection of Deterministic Supervisory Label Construction

## Status
**ACCEPTED** (Implemented in [ml-service/feature_engineering.py](file:///c:/Users/prana/OneDrive/Desktop/deploy-wealthgenie/ml-service/feature_engineering.py))

## Context & Problem Statement
Machine learning models for investment allocation require high-quality training labels mapping investor profiles to target asset allocation strategies (Conservative, Moderate, Growth, Aggressive).

## Alternatives Evaluated & Rejected

### 1. Manual Historical User Allocations
- **Mechanism**: Training on uncurated historical user portfolio selections.
- **Why Rejected**: Incorporates human behavioral biases (panic selling, momentum chasing) into ground truth training data.

### 2. Unsupervised Clustering (K-Means / GMM)
- **Mechanism**: Clustering investor profiles based on distance metrics.
- **Why Rejected**: Clusters lack financial semantics and regulatory compliance guarantees (e.g. assigning senior citizens aggressive equity allocations).

### 3. Pure Expert Rule Engine
- **Mechanism**: Static hardcoded lookup table.
- **Why Rejected**: Inflexible to subtle non-linear combinations of age, risk capacity, emergency fund coverage, and market volatility.

## Final Approach Chosen: Deterministic Financial Utility Label Generator
- **Implementation**: Synthesizes supervisory targets using mathematical Modern Portfolio Theory (MPT) risk-utility functions bounded by SEBI/AMFI asset allocation suitability guidelines.
