# Security Dependency Audit Report

## Executive Summary
This document summarizes the security dependency audits conducted for `server/`, `reactapp/`, and `ml-service/`.

---

## 1. Node.js Backend (`server/`)
- **Audit Tool**: `npm audit`
- **Baseline Findings**: 7 vulnerabilities (5 moderate, 2 high) in `axios`, `body-parser`, `form-data`, `joi`, `morgan`, `qs`, `express`.
- **Remediation**: Executed `npm audit fix`, updating package trees.
- **Post-Fix Audit Output**:
  ```
  found 0 vulnerabilities
  ```

---

## 2. React Frontend (`reactapp/`)
- **Audit Tool**: `npm audit`
- **Baseline Findings**: 8 vulnerabilities (1 low, 1 moderate, 6 high) in `@babel/core`, `brace-expansion`, `dompurify`, `js-yaml`, `postcss`, `react-router`, `vite`.
- **Remediation**: Executed `npm audit fix`, updating dependencies and patches.
- **Post-Fix Audit Output**:
  ```
  changed 35 packages, and audited 306 packages in 33s
  found 0 vulnerabilities
  ```

---

## 3. Python ML Microservice (`ml-service/`)
- **Audit Tool**: `pip-audit -r requirements.txt`
- **Baseline Findings**: 11 vulnerabilities in 3 packages (`python-dotenv 1.0.1`, `pytest 8.3.3`, `starlette 0.38.6`).
- **Remediation**: Upgraded `python-dotenv` (1.0.1 -> 1.2.2), `pytest` (8.3.3 -> 9.1.1), `fastapi` (0.115.0 -> 0.139.2), `starlette` (0.38.6 -> 1.3.1).
- **Post-Fix Audit Output**: All packages updated to safe release versions; `pytest` passes 15/15.
