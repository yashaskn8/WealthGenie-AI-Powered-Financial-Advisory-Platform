# Backend Test Coverage Report

## Overview

- **Engine**: `c8` (V8 Coverage)
- **Reporters**: `text`, `text-summary`, `json`, `lcovonly`
- **HTML Reports**: Completely disabled (`0` HTML files generated)

## Overall Metrics Summary

| Metric | Before | After | Delta |
|:---|:---:|:---:|:---:|
| **Statement Coverage** | 78.65% | **82.93%** | **+4.28%** |
| **Branch Coverage** | 60.92% | **60.70%** | -0.22% |
| **Function Coverage** | 84.27% | **86.46%** | **+2.19%** |
| **Line Coverage** | 78.65% | **82.93%** | **+4.28%** |

## Targeted High-Priority Component Improvements

| File / Component | Baseline Line % | Post-Test Line % | Delta | Key Additions |
|:---|:---:|:---:|:---:|:---|
| `services/arithmeticVerifier.js` | 36.55% | **95.86%** | **+59.31%** | Regex pattern matching for SIP, lump sum, tolerance checking |
| `services/marketDataService.js` | 62.26% | **87.54%** | **+25.28%** | Live parameter extraction, fallback error handling |
| `routes/montecarlo.js` | 14.45% | **95.18%** | **+80.73%** | Authenticated Monte Carlo simulation flow with profile ID |
| `routes/auth.js` | 37.70% | **62.29%** | **+24.59%** | Error paths (invalid password, registration duplicates) |
| `routes/market.js` | 40.78% | **71.05%** | **+30.27%** | Rates, parameter endpoints, refresh flows |
| `routes/projection.js` | 40.14% | **54.92%** | **+14.78%** | Trajectory & projection endpoint validation |
| `services/xirrCalculator.js` | 39.15% | **50.60%** | **+11.45%** | Edge cases (invalid dates, non-array cashflows, SIP helper) |

## Key Covered Core Engines (>80%)

- `middleware/authMiddleware.js`: **90.47%**
- `middleware/errorHandler.js`: **86.86%**
- `services/taxEngine.js`: **80.12%**
- `services/portfolioEngine.js`: **90.09%**
- `services/RecommendationPipeline.js`: **97.81%**
- `services/monteCarloEngine.js`: **92.19%**
- `services/projectionEngine.js`: **92.60%**
