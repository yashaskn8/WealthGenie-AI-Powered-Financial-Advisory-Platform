# 11. Service Boundary Decoupling Rationale and Cost Analysis

* **Status**: Accepted
* **Date**: 2026-07-24
* **Deciders**: WealthGenie Architecture Review Board

## Context and Problem Statement

The WealthGenie platform is architected into three discrete deployable units: `server` (Node.js REST API & Financial Orchestrator), `ml-service` (Python FastAPI ML/TreeSHAP Engine), and `reactapp` (Vite SPA Frontend). We must document strict technical justifications for each service boundary and evaluate the exact architectural cost of merging them into a single monolithic unit.

## Decision Drivers

* Independent autoscaling based on compute profiles (CPU-bound matrix math vs IO-bound REST orchestration vs static asset CDN delivery).
* Technology stack specialization (Node.js for asynchronous IO and JSON throughput vs Python for PyTorch/XGBoost/TreeSHAP matrix memory structures vs browser JavaScript DOM rendering).
* Fault isolation and independent deployment lifecycles.

## Service Boundary Justifications and Merge Cost Analysis

### 1. `server` (Node.js REST API & Financial Orchestrator)

* **Deployment Justification**: The `server` handles high-concurrency API request routing, JWT session verification, database transactions with MongoDB, cache management with Redis, and external LLM/market-data HTTP orchestration requiring an event-driven asynchronous non-blocking IO loop. It serves as the institutional gateway that enforces security headers, input sanitization, rate limiting, and regulatory compliance disclaimers across all endpoints. Isolating this component guarantees low-latency HTTP throughput without risk of event loop blocking from numerical optimization or model inference routines.
* **Cost of Merging into Monolith**: Merging `server` with `ml-service` would force Node.js to execute heavy Python C-bindings or spawned subprocesses, introducing process overhead and catastrophic event-loop blocking during intensive TreeSHAP attribution calculations. Merging with `reactapp` into a monolithic Server-Side Rendered (SSR) bundle would couple API availability to frontend rendering pipelines, inflating deployment artifact size by >200MB and preventing standalone CDN edge distribution.

### 2. `ml-service` (Python FastAPI / PyTorch / XGBoost ML Microservice)

* **Deployment Justification**: The `ml-service` encapsulates numerical machine learning models, scikit-learn transformers, and TreeSHAP explainability pipelines that depend on C-native Python libraries (`numpy`, `pandas`, `shap`, `joblib`) and heavy memory footprints (~500MB+ per worker). Separating it allows dedicated CPU/GPU hardware provisioning and horizontal scaling tuned specifically to inference load rather than REST API volume. Furthermore, it protects client-facing advisory endpoints by allowing graceful rule-based fallback inside `server` whenever `ml-service` undergoes rolling model re-training updates.
* **Cost of Merging into Monolith**: Merging `ml-service` into `server` via Node.js native add-ons or PyNode bridges would create unsafe cross-language memory management, risk process crashes due to Python GIL lock contention, and dramatically inflate server startup time from <1 second to >15 seconds. Merging into `reactapp` is technically impossible as browser JavaScript runtimes lack native support for heavy C-compiled PyTorch/TreeSHAP model binaries.

### 3. `reactapp` (Vite / React SPA Frontend)

* **Deployment Justification**: The `reactapp` is a purely client-side Single Page Application (SPA) designed to be built into static HTML/JS/CSS assets and served directly from edge Content Delivery Networks (CDNs) with zero server-side computational overhead. Decoupling the frontend guarantees sub-50ms Global First Contentful Paint (FCP) and ensures the user interface remains responsive and interactive even during backend network blips or maintenance windows. It also establishes a clear security boundary where raw API keys, database credentials, and internal ML model weights never cross into the client browser runtime.
* **Cost of Merging into Monolith**: Merging `reactapp` into `server` as server-rendered templates (e.g. EJS/Pug or Next.js SSR) would convert static CDN fetches into dynamic server CPU workloads, increasing node memory consumption and server operational costs by an estimated 400%. Additionally, it would eliminate independent frontend deployment velocity, requiring full backend regression testing for simple UI style or copy modifications.

## Consequences

* **Positive**: Each service scales independently according to its compute footprint (CDN edge for `reactapp`, lightweight Node.js pods for `server`, high-memory Python containers for `ml-service`).
* **Negative**: Requires maintaining explicit OpenAPI/REST service contracts, inter-service API key authentication (`X-API-Key`), and distributed correlation tracing (`X-Correlation-ID`).
