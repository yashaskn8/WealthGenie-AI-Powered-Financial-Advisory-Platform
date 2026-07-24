# WealthGenie System Dependency & Failure Resilience Map

This document establishes the authoritative service-to-service and service-to-datastore dependency map for the WealthGenie platform. For every caller-callee relationship, the degraded failure mode, mitigation mechanism, and empirical chaos test cross-references are documented below.

---

## 1. Service & Datastore Dependency Matrix

| Caller Service | Callee Dependency | Call Protocol | Failure Mode when Callee is Down | Resilient Fallback Mechanism | Chaos Test Verification Proof |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `reactapp` (Vite SPA) | `server` (Express REST) | HTTP / REST (JSON) | API calls fail (network error / 5xx) | UI displays offline indicator, cached local state, and retry prompts. | `server/test/chaos.test.js#L123-L132` |
| `server` | `MongoDB` (Mongoose ODM) | Mongoose Wire Protocol | Writes fail with `MongoNetworkError` / `MongoServerSelectionError` | Centralized error handler catches database loss and returns HTTP `503 Service Unavailable` with user-friendly retry message. | `server/test/chaos.test.js#L107-L133` |
| `server` | `Redis` (Upstash / Redis) | RESP2 Protocol via `redis` client | Cache reads/writes return `null` / fail-open | Silently bypasses cache and proceeds directly to MongoDB source-of-truth; rate limiters fail open safely. | `server/test/chaos.test.js#L136-L163` |
| `server` | `ml-service` (FastAPI ML) | HTTP POST (`/predict/enriched`) | Connection timeout / ECONNREFUSED / 5xx | `mlClient` catches error and falls back to deterministic rule-based allocation pipeline (`getRuleBasedFallback`). | `server/test/chaos.test.js#L166-L205` |
| `server` | `Gemini API` (Google GenAI) | HTTPS POST (`generativelanguage.googleapis.com`) | API Key invalid / Rate limit / Network failure | `ProviderManager` automatically fails over to Groq API adapter (`api.groq.com`). | `server/test/geminiChatService.test.js#L115-L120` |
| `server` | `Groq API` (Groq Cloud) | HTTPS POST (`api.groq.com`) | Secondary provider failure | `ProviderManager` falls back to `local` fallback adapter generating static advisory text grounded on user profile. | `server/test/chaos.test.js#L208-L245` |
| `server` | `AMFI India API` | HTTPS GET (`NAVAll.txt`) | External HTTP failure / DNS timeout | `marketDataService` returns cached NAV data from Redis or static fallback instrument rates from `instrumentConstants.js`. | `server/test/serviceCoverage.test.js` |
| `ml-service` | Local Models (`joblib`) | File System I/O | Model file missing / corrupt | `ModelExplainer` logs error and falls back to heuristic baseline feature attribution. | `ml-service/tests/test_main.py` |

---

## 2. Detailed Dependency Breakdown & Degradation Paths

### 2.1 `server` → `MongoDB`
* **Protocol**: Mongoose TCP Wire Protocol (`mongodb://127.0.0.1:27017/wealthgenie`)
* **Normal Operation**: Reads and writes user accounts, financial profiles, goals, recommendations, and conversation histories.
* **Failure Scenario**: Database crash, network partition, or pool exhaustion.
* **Degraded Behavior**: The application catches `MongoNetworkError` or `MongoServerSelectionError` in `errorHandler.js` and returns `503 Service Unavailable` (`"Database service temporarily unavailable. Please try again in a few moments."`).
* **Empirical Proof**: Verified by `server/test/chaos.test.js#L107-L133`.

### 2.2 `server` → `Redis`
* **Protocol**: RESP2 Protocol (`redisClient`)
* **Normal Operation**: Caches recommendation results (`24h`), market indices (`1h`), instrument parameters (`24h`), and enforces rate limits.
* **Failure Scenario**: Redis node restart or network disconnection.
* **Degraded Behavior**: All `getCache` calls return `null` and `setCache` calls fail silently. The system falls through to execute core database queries and financial calculations. Rate limiting and idempotency guards fail open to preserve service availability.
* **Empirical Proof**: Verified by `server/test/chaos.test.js#L136-L163`.

### 2.3 `server` → `ml-service`
* **Protocol**: HTTP POST (`http://127.0.0.1:8000/predict/enriched`) with `X-API-Key` and `X-Correlation-ID`.
* **Normal Operation**: Evaluates Random Forest asset allocation predictions and TreeSHAP feature attributions.
* **Failure Scenario**: `ml-service` container crash, 5-second timeout, or network unreachability.
* **Degraded Behavior**: `mlClient.js` catches the exception and invokes `getRuleBasedFallback()`, which computes deterministic instrument weights based on age, income tier, risk tolerance, and tax regime. The response is flagged with `ml_fallback: true` and `model_version: "rule_fallback"`.
* **Empirical Proof**: Verified by `server/test/chaos.test.js#L166-L205`.

### 2.4 `server` → Primary & Secondary LLM APIs (`Gemini` & `Groq`)
* **Protocol**: HTTPS REST (`generativelanguage.googleapis.com` & `api.groq.com`).
* **Normal Operation**: Generates natural language advisory insights for Genie Chat.
* **Failure Scenario**: Outage or quota exhaustion on both external LLM APIs.
* **Degraded Behavior**: `geminiChatService.js` catches provider failures and routes execution to `generateLocalFallbackResponse()`. It produces a structured response containing exact mathematical insights, tax slab calculations, and action cards directly derived from the user's `FinancialProfile` document.
* **Empirical Proof**: Verified by `server/test/chaos.test.js#L208-L245`.

---

## 3. Chaos Verification Command

To run the complete automated chaos test suite and verify dependency failure handling at any time:

```bash
node --test server/test/chaos.test.js
```
