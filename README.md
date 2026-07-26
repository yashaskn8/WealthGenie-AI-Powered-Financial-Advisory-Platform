# WealthGenie

> **Tax-Optimized Personal Financial Advisory & Portfolio Allocation System**

WealthGenie is a decoupled three-tier financial advisory application designed for Indian retail investors. It combines multi-factor instrument scoring, stochastic Quasi-Monte Carlo wealth projection, tax optimization under FY 2025-26 rules, Markowitz-style portfolio optimization, and an ML-powered recommendation engine with explainability.

---

## 🏛 Architecture Overview

The system is structured into three decoupled services:

```
                  ┌──────────────────────────────┐
                  │    React 19 SPA (Vite)       │
                  │         (Frontend)           │
                  └──────────────┬───────────────┘
                                 │ REST API
                                 ▼
                  ┌──────────────────────────────┐
                  │   Express.js API Gateway     │
                  │          (Backend)           │
                  └──────────────┬───────────────┘
                                 │
           ┌─────────────────────┼─────────────────────┐
           ▼                     ▼                     ▼
┌────────────────────┐ ┌────────────────────┐ ┌────────────────────┐
│   MongoDB Store    │ │  FastAPI ML Engine │ │   Google Gemini    │
│  (Profiles/Users)  │ │  (Scoring & SHAP)  │ │  (AI Advice Chat)  │
└────────────────────┘ └────────────────────┘ └────────────────────┘
```

1. **Frontend (`reactapp/`)**: React 19 single-page application built with Vite and Vanilla CSS, offering interactive goal tracking, rebalancing visualizers, post-tax analysis, and AI chat.
2. **Backend (`server/`)**: Express.js REST API providing core computational engines:
   - **Tax Engine**: Computes taxes under Old vs. New FY 2025-26 regimes (Section 87A rebate cliff, surcharge tiers, marginal relief).
   - **Quasi-Monte Carlo Engine**: Simulates wealth growth bands (P₁₀, P₅₀, P₉₀) over projection horizons using low-discrepancy Halton sequences.
   - **Portfolio Engine**: Performs Minimum Variance, Maximum Sharpe, and Risk Parity optimizations.
   - **Recommendation Pipeline**: Multi-factor scoring engine filtering and ranking financial instruments across asset classes.
3. **ML Microservice (`ml-service/`)**: FastAPI service running a Scikit-Learn suitability model with SHAP feature attributions.

---

## 🚀 Key Features

- **Tax Optimization (FY 2025-26)**: Compares Old and New regimes, considering standard deductions, 80C/80D caps, 87A rebates, and surcharge thresholds.
- **Quasi-Monte Carlo Simulation**: Models market return distribution using Geometric Brownian Motion (GBM) to evaluate sequence-of-returns risk.
- **Portfolio Optimization**: Calculates optimal asset weights using covariance matrices across equities, debt, gold, and fixed deposits.
- **Explainable ML Recommendations**: Evaluates investor profiles and outputs instrument scores accompanied by SHAP explainability metrics.
- **Interactive Advisory Assistant**: Integrates Google Gemini API for context-aware Q&A on tax strategies and investment recommendations.

---

## 📂 Project Structure

```
deploy-wealthgenie/
├── reactapp/             # React 19 Frontend (Vite)
│   ├── src/
│   │   ├── components/   # UI Screens & Modals
│   │   ├── engine/       # Frontend Tax & Goal Calculators
│   │   └── services/     # API Service Integration
│   └── package.json
├── server/               # Express.js Backend Service
│   ├── services/         # Core Math & Analytical Engines
│   ├── routes/           # REST API Endpoints
│   ├── models/           # Mongoose Data Schemas
│   ├── test/             # Backend Test Suite
│   └── package.json
├── ml-service/           # FastAPI ML Microservice
│   ├── model/            # Model Training & Inference Logic
│   ├── tests/            # Pytest Suite
│   └── main.py           # FastAPI Application Entry
├── .github/              # GitHub Actions CI Workflow
└── README.md
```

---

## 🛠 Quick Start & Local Setup

### Prerequisites
- **Node.js**: `v20.x` or `v22.x`
- **Python**: `v3.12+`
- **MongoDB**: Local or MongoDB Atlas URI (optional for offline testing)

---

### 1. Backend Service (`server/`)

```bash
cd server
npm install
npm test            # Run unit test suite
npm run dev         # Start server in watch mode (default: http://localhost:5000)
```

**Environment Variables (`server/.env`):**
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/wealthgenie
JWT_SECRET=your_jwt_secret_here
GEMINI_API_KEY=your_gemini_api_key
ML_SERVICE_URL=http://localhost:8000
```

---

### 2. Frontend Application (`reactapp/`)

```bash
cd reactapp
npm install
npm test            # Run frontend component & utility tests
npm run dev         # Start Vite dev server (default: http://localhost:5173)
```

---

### 3. ML Microservice (`ml-service/`)

```bash
cd ml-service
python -m venv .venv
# Windows:
.venv\Scripts\activate
# Linux/macOS:
source .venv/bin/activate

pip install -r requirements.txt
pytest              # Run ML unit tests
uvicorn main:app --reload --port 8000
```

---

## 🧪 Testing

The repository maintains test coverage across all three services:

- **Backend Tests**: Run `npm test` inside `server/` (Node.js test runner covering tax, Monte Carlo, portfolio optimization, and recommendation pipeline engines).
- **Frontend Tests**: Run `npm test` inside `reactapp/` (Vitest suite for components and utility functions).
- **ML Tests**: Run `pytest` inside `ml-service/` (Pytest suite for dataset construction and inference schemas).

---

## 📄 License

This project is open-source and licensed under the [MIT License](LICENSE).
