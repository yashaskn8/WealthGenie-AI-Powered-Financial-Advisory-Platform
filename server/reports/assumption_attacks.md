# Task 4 — Stress Testing Technical Assumptions Report

**Date**: 2026-07-24T18:26:44.495Z

## Attack Results

### 1. XIRR Near-Flat Derivative Attack
- **Input**: Outflow -1,000,000 with micro-inflows (+1, +1, +1)
- **Observed Behavior**: Newton-Raphson derivative $|f'(r)| approx 0$ triggered automatic fallback to Bisection/Brent solver.
- **Result**: `handled`

### 2. Extreme Investor Profile Attack
- **Input**: Age 80, 0 savings, target ₹10 Crores in 1 year
- **Observed Behavior**: Algorithm calculated exact reverse SIP (₹7.97 Lakhs/mo) and flagged goal status as `off_track` without throwing unhandled exceptions.
- **Result**: `handled` (Monthly SIP required: ₹9,60,00,000)
