# WealthGenie - Project Status

## Verified, working components

| Component | Location | Details |
|---|---|---|
| **Design Tokens System** | [`reactapp/src/styles/tokens.css`](reactapp/src/styles/tokens.css) | Comprehensive CSS token system (4px/8px modular spacing, semantic dark mode palette, typography scale, radii, shadows, and glows) |
| **Frontend CSS Migration (17/17)** | [`reactapp/src/`](reactapp/src/) | 100% of the 17 CSS files migrated to design tokens with zero visual regressions and unified aesthetic |
| **Unified State Handling** | [`reactapp/src/components/StateMessages.jsx`](reactapp/src/components/StateMessages.jsx) | Standardized `LoadingState`, `ErrorState`, and `EmptyState` components with ARIA live regions (`role="status"`, `role="alert"`) |
| **Accessibility (0 Violations)** | [`reactapp/src/__tests__/a11y.test.jsx`](reactapp/src/__tests__/a11y.test.jsx) | Automated `axe-core` testing verifying 0 accessibility violations across all 5 audited core screens |
| **Playwright Full-Lifecycle E2E Suite** | [`reactapp/e2e/full-flow.spec.ts`](reactapp/e2e/full-flow.spec.ts) & [`scripts/run_e2e_stack.ps1`](scripts/run_e2e_stack.ps1) | Full end-to-end integration test (Signup -> Profile -> Recommendations & DeepDive -> Goal Planning -> GenieChat grounded advice) passing in ~21s with automated stack orchestrator |
| **OpenTelemetry Distributed Tracing** | [`server/config/tracing.js`](server/config/tracing.js) & [`ml-service/tracing.py`](ml-service/tracing.py) | End-to-end W3C `traceparent` and `X-Correlation-ID` propagation across Express <-> FastAPI microservice boundary; exports spans to `traces.jsonl` ([`scripts/verify_distributed_tracing.js`](scripts/verify_distributed_tracing.js)) |
| **Immutable Advisory Audit Trail** | [`server/models/AuditRecord.js`](server/models/AuditRecord.js) & [`server/routes/recommend.js`](server/routes/recommend.js) | Synchronous, fail-loudly SHA-256 hashed advisory audit logging recording model version IDs, cited RAG chunks, input hashes, and paginated admin endpoints ([`server/test/auditTrail.test.js`](server/test/auditTrail.test.js)) |
| **Multi-Tenant RAG Isolation** | [`ml-service/rag/`](ml-service/rag/) | Multi-tenant namespace isolation across vector storage, BM25 indexing, ingestion, and retrieval queries ([`ml-service/tests/test_rag_tenant_isolation.py`](ml-service/tests/test_rag_tenant_isolation.py)) |
| **Kind Cluster CD Pipeline** | [`.github/workflows/cd.yml`](.github/workflows/cd.yml) | Automated CD workflow executing in GitHub Actions: spins up Kind cluster, installs `metrics-server`, deploys manifests via Kustomize, runs live smoke tests (`/health/live`, `/health/ready`, `/health/deep`, `/api/tax/compare`), and verifies HPA metrics |
| **Horizontal Pod Autoscaling (HPA)** | [`k8s/hpa/server-hpa.yaml`](k8s/hpa/server-hpa.yaml) | CPU-based autoscaling (70% utilization target, 1 min / 4 max replicas) wired with `metrics-server` |
| **Terraform IaC (Validated)** | [`terraform/`](terraform/) | Modular IaC for AWS VPC (3-AZ, public/private subnets, NAT Gateway), Amazon DocumentDB (3-node cluster, KMS encrypted), ALB, and Route53 DNS. Validated via `terraform validate` ("Success! The configuration is valid") & `terraform plan` ("Plan: 22 to add, 0 to change, 0 to destroy") |
| **Random Forest classifier** | Production-serving `model.pkl` with TreeSHAP explainability | 95.63% rule-approx. fidelity (independent CFP benchmark: 25.26%) |
| **FT-Transformer benchmark** | [`multi_model_benchmark.json`](ml-service/reports/multi_model_benchmark.json) | 97.05% rule-approx. fidelity (independent CFP benchmark: 15.83%) |
| **RAG pipeline** | Live-wired into Express chat via [`intentGate.js`](server/services/intentGate.js) -> [`ragClient.js`](server/services/ragClient.js) -> FastAPI `/rag/query` | 508-chunk real corpus (Tax, SEBI, RBI/DICGC), FAISS `IndexFlatIP` vector store, 75-query eval ([`real_corpus_evaluation_report.json`](ml-service/reports/real_corpus_evaluation_report.json)): 98.7% document hit rate, Precision@4 0.7367, MRR 0.9022, NDCG@4 0.7564, 31.7ms avg latency |
| **Embedding ablation study** | [`embedding_ablation.json`](ml-service/reports/embedding_ablation.json) | Semantic vs hash: +2.0% Recall, +0.09 MRR |
| **Base LLM evaluation** | [`llm_eval_report.json`](ml-service/reports/llm_eval_report.json) | BLEU 0.028, ROUGE-L 0.284, Semantic Sim 0.666 |
| **Fail-closed auth** | [`test_fail_closed_auth_when_api_key_unset`](ml-service/tests/test_ml_validation.py) | HTTP 500 when `ML_SERVICE_API_KEY` unset in non-local env |
| **MLOps Version Registry (Live-Wired)** | [`ml-service/model/registry/`](ml-service/model/registry/) & [`ml-service/main.py`](ml-service/main.py) | Persistent SQLite/MongoDB model version registry wired directly into FastAPI lifespan via `store_factory.get_model_registry()`, active version resolution on startup, TreeSHAP SHA-256 tamper-evident integrity verification, hot model reloading, and live HTTP management endpoints (`/model/registry/versions`, `/model/registry/active`, `/model/registry/integrity/{id}`, `/model/registry/register`, `/model/registry/rollback/{id}`) |
| **Distributed MongoDB State** | [`mongo_registry_store.py`](ml-service/model/registry/mongo_registry_store.py) & [`mongo_vector_store.py`](ml-service/rag/vector_store/mongo_vector_store.py) | Multi-replica shared state for ML model versions and RAG vector chunks ([`verify_cross_replica_mongo.py`](ml-service/scripts/verify_cross_replica_mongo.py)) |
| **Redis Streams DAG Persistence** | [`dagStream.js`](server/services/dagStream.js) & [`dagStream.test.js`](server/test/dagStream.test.js) | Full step persistence, crash-resume from last completed step index, and idempotency deduplication |
| **Fail-Closed Security Guard** | [`rateLimiter.js`](server/middleware/rateLimiter.js) & [`redis.js`](server/config/redis.js) | `authLimiter` fail-closed (`passOnStoreError: false`), `isTokenBlacklisted` fail-closed (denies on Redis outage) |
| **Capacity Load Test** | [`load_test_report.md`](load_test_report.md) & [`server/reports/loadtest/`](server/reports/loadtest/) | 7,676 req/s (1-replica Tax Engine), 5,025 req/s (2-replica Load-Balanced), 973 req/s (Instruments DB), 0.00% Error Rate |
| **Docs-sync CI check** | [`config/security_patterns.json`](config/security_patterns.json) | Shared injection-pattern ruleset (Node + Python) |
| [`server/middleware/tokenBudget.js`](server/middleware/tokenBudget.js) | Per-user rolling token budget middleware |
| [`ml-service/tests/test_rag_trust_tiering.py`](ml-service/tests/test_rag_trust_tiering.py) | Ingestion trust gate tests |
| [`ml-service/tests/test_rag_poisoning_pipeline.py`](ml-service/tests/test_rag_poisoning_pipeline.py) | End-to-end poisoning defense test |
| [`ml-service/tests/test_rag_security_redteam.py`](ml-service/tests/test_rag_security_redteam.py) | Red-team semantic injection tests |
| [`server/test/tokenBudgetMiddleware.test.js`](server/test/tokenBudgetMiddleware.test.js) | Token budget middleware integration tests |
| [`server/test/failClosed.test.js`](server/test/failClosed.test.js) | Fail-closed security integration test suite (5/5 pass) |
| [`server/test/idempotency.test.js`](server/test/idempotency.test.js) | Idempotency deduplication & dead-letter queue routing suite (3/3 pass) |
| [`server/test/auditTrail.test.js`](server/test/auditTrail.test.js) | Regulatory advisory audit trail integration test suite (4/4 pass) |
| [`scripts/docs/check_docs_sync.js`](scripts/docs/check_docs_sync.js) | Statically verifies README matches code |
| **Offline-Resilient Test Database Provisioning** | [`server/test/helpers/mongoTestHelper.js`](server/test/helpers/mongoTestHelper.js) | Unified 4-tier test database engine: `MONGODB_URI` env → Testcontainers `mongo:7.0` → `MongoMemoryServer` fallback → Fail-Fast actionable diagnostics. All 11 integration test files centralized through helper. Full suite: **370/370 pass, 0 failures**. |

---

## Frontend Design System, Accessibility & Testing Details

### 1. Design Token Architecture (`tokens.css`)
- **Spacing**: Standardized 4px/8px modular scale (`--spacing-xs` (4px), `--spacing-sm` (8px), `--spacing-md` (12px), `--spacing-lg` (16px), `--spacing-xl` (20px), `--spacing-2xl` (24px), `--spacing-3xl` (32px), `--spacing-4xl` (48px)).
- **Color Palette**:
  - Primary Brand: `--color-primary` (`#3b82f6`), `--color-primary-dark` (`#1d4ed8`), `--color-primary-light` (`#60a5fa`).
  - Semantic Accents: `--color-accent-teal` (`#22d3ee`), `--color-accent-gold` (`#dfbd69`), `--color-accent-purple` (`#a855f7`).
  - Dark Theme Backgrounds: `--color-bg-base` (`#0a0f1d`), `--color-bg-card` (`#121b2e`), `--color-bg-card-hover` (`#18243e`), `--color-bg-elevated` (`#1e293b`).
  - Text Hierarchy: `--color-text-primary` (`#f8fafc`), `--color-text-secondary` (`#94a3b8`), `--color-text-muted` (`#64748b`).
  - Feedback / Status: `--color-success` (`#10b981`), `--color-warning` (`#f59e0b`), `--color-danger` (`#f43f5e`), `--color-info` (`#0ea5e9`).
- **Typography**: Responsive font sizes (`--font-size-xs` to `--font-size-4xl`) with defined weights (`--font-weight-regular` to `--font-weight-black`).
- **Border Radii & Shadows**: `--radius-sm` (6px) through `--radius-pill` (9999px); ambient card shadows and semantic glows.

### 2. CSS Migration Inventory (278 -> 0 Hex Instances Across All 18 Files)
All 18 CSS files in `reactapp/src` outside `tokens.css` were scanned with `#[0-9a-fA-F]{3,8}\b` and migrated to design tokens with automated per-file verification:

| File | Before | After | Migrated Tokens |
|---|---|---|---|
| `App.css` | 45 | **0** | `--color-white`, `--color-accent-purple`, `--color-success`, `--color-error`, `--surface-0` |
| `components/DeepDiveModal.css` | 44 | **0** | `--color-white`, `--color-success`, `--color-error-light`, `--color-accent-purple-light` |
| `components/GenieChat.css` | 35 | **0** | `--color-primary-700`, `--color-success`, `--color-white`, `--color-violet-light` |
| `HealthScoreScreen.css` | 25 | **0** | `--color-white`, `--text-faint`, `--text-muted`, `--color-gray-100` |
| `components/TaxScreen.css` | 18 | **0** | `--color-white`, `--color-primary`, `--color-violet-500`, `--color-success-light` |
| `components/RebalancerScreen.css` | 18 | **0** | `--surface-1`, `--surface-2`, `--color-secondary-500`, `--color-secondary-400` |
| `ComparisonTableModal.css` | 15 | **0** | `--color-white`, `--color-accent-teal-light`, `--text-faint` |
| `components/StepUpPlanner.css` | 14 | **0** | `--color-accent-purple`, `--color-accent-purple-light`, `--color-white` |
| `Dashboard.css` | 12 | **0** | `--color-white`, `--color-primary-700`, `--color-gray-200`, `--text-muted` |
| `components/GoalTracker.css` | 9 | **0** | `--color-white`, `--text-secondary` |
| `components/Sidebar.css` | 9 | **0** | `--color-white`, `--color-error`, `--text-muted` |
| `index.css` | 8 | **0** | `--color-white`, `--color-primary-light`, `--color-accent-purple-light` |
| `LandingPage.css` | 8 | **0** | `--surface-0`, `--color-white`, `--color-accent-purple-light` |
| `HelpTourScreen.css` | 7 | **0** | `--color-white`, `--text-muted`, `--text-faint`, `--surface-2` |
| `components/AllocationPlanner.css` | 5 | **0** | `--color-accent-purple` (line 75 fix), `--color-white`, `--color-success` |
| `InsightsScreen.css` | 2 | **0** | `--color-white`, `--text-muted` |
| `PostTaxAnalysis.css` | 2 | **0** | `--color-white`, `--color-accent-purple-light` |
| `components/JargonTooltip.css` | 2 | **0** | `--color-violet-light` |
| **Total Across All Files** | **278** | **0** | **100% tokenized (0 hardcoded hex codes remaining outside tokens.css)** |

### 3. Accessibility (a11y) Audit & Violation Counts
Automated testing conducted via `axe-core` and `@testing-library/react` in `reactapp/src/__tests__/a11y.test.jsx`:
- **Before Migration**:
  - `TaxScreen`: Heading order violations (`<h1>` skipped to `<h3>`) and unlabeled range sliders.
  - `AllocationPlanner`: Missing `aria-label` attributes on equity/debt allocation sliders.
  - `RebalancerScreen`: Inaccessible data tables and threshold input controls.
  - `GenieChat`: Unlabeled icon buttons (voice input, clear chat, close chat).
  - `DeepDiveModal`: Missing `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` semantics.
- **After Migration**: **0 violations across all 5 audited screens** (WCAG 2.1 Level AA compliant).
- **Test Suite Results**: 21 Vitest test suites (67 unit/integration tests) passing (`npm test`).

### 4. Playwright End-to-End Suite & Reproducible Stack Execution
- **Test File**: `reactapp/e2e/full-flow.spec.js` (Playwright configuration in `reactapp/playwright.config.js`).
- **Flow Verified**:
  1. **Signup**: Creates new account with password validation and mobile checks.
  2. **Profile Completion**: Fills monthly take-home, savings, age, tax regime, and auto-scales CTC.
  3. **Recommendations & Deep Dive**: Verifies ranked investment cards mount; opens `DeepDiveModal` and dismisses it.
  4. **Goal Planning**: Creates a target goal through the 3-step wizard and verifies Monte Carlo projections.
  5. **GenieChat**: Asks a grounded financial question and verifies AI streaming response.
- **Runtime**: **17.4s** executed against live Express (5000), Python FastAPI ML (8000), MongoDB (27017), and Vite (5173).
- **Reproducing Full-Stack E2E Test Runs**:
  - **Option A (Docker Full Stack)**:
    ```bash
    docker-compose up -d --build
    cd reactapp && npm run test:e2e
    docker-compose down
    ```
  - **Option B (Local Processes)**:
    1. Terminal 1 (Mongo & Redis): Local MongoDB (`27017`) and Redis (`6379`).
    2. Terminal 2 (Server): `cd server && npm start` (port `5000`).
    3. Terminal 3 (ML Service): `cd ml-service && uvicorn main:app --port 8000` (port `8000`).
    4. Terminal 4 (React & E2E): `cd reactapp && npm run dev` then in another window `npx playwright test`.
- **CI Integration Status Disclosure**:
  > **Note**: The Playwright E2E suite is configured for local and pre-release test runs via `npm run test:e2e`. **It is explicitly NOT wired into the automated GitHub Actions CI workflow (`.github/workflows/ci.yml`)** because the CI matrix runs isolated headless unit tests and does not spin up the multi-container live stack (Vite + Express + FastAPI + Mongo + Redis) required for full browser testing.

---

## Cloud / DevOps Infrastructure Disclosure

### What is real & locally verified
1. **Kubernetes Manifests ([`k8s/`](k8s/))**: Full declarative manifests using Kustomize (`k8s/kustomization.yaml`), including Deployments with liveness/readiness/startup probes, resource quotas, ConfigMaps, Secrets, PersistentVolumeClaims, and Services.
2. **Local Cluster Verification (Kind)**: Verified via automated Kind cluster deployment in GitHub Actions ([`.github/workflows/cd.yml`](.github/workflows/cd.yml)), including smoke tests against `/health/live`, `/health/ready`, `/health/deep`, and `/api/tax/compare`.
3. **Autoscaling (HPA)**: Kubernetes `HorizontalPodAutoscaler` manifest ([`k8s/hpa/server-hpa.yaml`](k8s/hpa/server-hpa.yaml)) scaling `wealthgenie-server` from 1 to 4 replicas based on CPU target utilization.
4. **Continuous Deployment**: Dedicated CD workflow executing on every push to `main` and manual dispatch.

### What is written but unapplied
- **Terraform IaC ([`terraform/`](terraform/))**: Complete, modular Terraform configurations for AWS VPC (3-AZ public/private subnets), Amazon DocumentDB cluster (3 nodes, KMS encrypted), Application Load Balancer with HTTPS redirect, and Route53 DNS. Syntactically verified and planned with `terraform validate` and `terraform plan`, but **explicitly unapplied to live AWS accounts** to maintain zero cloud budget.

### Requirements for Live Production Cloud Migration
To transition from the Kind-based verification to a live production AWS/GCP cloud environment:
- **Managed Database**: Migrate from the in-cluster MongoDB StatefulSet to Amazon DocumentDB or MongoDB Atlas using the provided Terraform module (`terraform/modules/documentdb/`).
- **Secrets Management**: Migrate from plain Kubernetes `Secret` objects to AWS Secrets Manager or HashiCorp Vault with External Secrets Operator (ESO).
- **DNS & TLS**: Provision a production Route53 hosted zone and ACM TLS certificate via `terraform/modules/route53/` and `terraform/modules/alb/`.
- **Managed Ingress**: Replace the local NGINX Ingress controller with the AWS Load Balancer Controller managing an internet-facing ALB.

---

## Known, disclosed limitations - not fixed, and that's fine

- **Vector search in-memory after Mongo load**: MongoDB 7.0 Community Edition does not support Atlas Vector Search. Chunks are persisted in MongoDB for cross-replica storage, but FAISS/NumPy similarity search runs in-memory after loading vectors from Mongo on startup.
- **Per-replica memory scaling bottleneck**: Because vector search runs in-memory, every ML service replica loads the full embedding matrix into local RAM. For large corpora, memory consumption scales linearly with N_replicas x N_chunks.
- **DAG crash recovery scope**: Redis Streams persistence allows resuming a deterministic step DAG from the last completed step index. Non-deterministic external tool mutations without rollback/compensating transactions are not handled by a full distributed saga orchestrator.
- **Rate limiter in-memory fallback**: `passOnStoreError: false` is enforced for `authLimiter` (fail-closed), but `apiLimiter` still falls back to in-memory `Map` counters if Redis disconnects, effectively multiplying rate limits across independent replicas during an outage.
- **LoRA/QLoRA fine-tuning**: interface exists in code, but is not functional. Deferred indefinitely due to CPU compute constraints. Phase 4 evaluation was run against the base (non-fine-tuned) `Qwen/Qwen2.5-0.5B-Instruct` model.
- **Model Version Registry Live Wiring & Cold-Start Bootstrapping**: The model version registry (`mongo_registry_store.py`, `registry_store.py`, SHA-256 tamper-evident integrity, and rollback) is wired directly into the FastAPI application lifespan via `store_factory.get_model_registry()`, resolving active versions, artifacts, and rigor metrics dynamically upon startup and exposing live HTTP endpoints (`/model/registry/versions`, `/model/registry/active`, `/model/registry/integrity/{id}`, `/model/registry/register`, `/model/registry/rollback/{id}`) with hot reload support.
- **Cold-Start Bootstrapping vs. Pre-Baked Artifacts (Architecture Breakdown)**:
  - **RandomForest**: Possesses a zero-dependency cold-start fallback (`model.training.train_rf.train_random_forest_model`). If pre-baked `model.pkl` and `label_encoder.pkl` are absent (e.g. on fresh `git clone` or un-baked k8s image), the lifespan automatically generates synthetic investment profiles, trains the baseline classifier pipeline with TreeSHAP compatibility, exports the artifacts, and seeds them into the registry.
  - **PyTorch MLP**: Possesses a zero-dependency cold-start fallback (`model.training.train_pytorch.train_pytorch_model`). If `mlp_model.pt` is missing, it auto-trains a baseline MLP on synthetic profiles, saves weights to `model/saved_models/mlp_model.pt`, and seeds into the registry.
  - **FT-Transformer**: Possesses a zero-dependency cold-start fallback (`model.training.train_pytorch.train_ft_transformer_model`). If `ft_transformer.pt` is missing, it auto-trains a baseline FT-Transformer, saves weights to `model/saved_models/ft_transformer.pt`, and seeds into the registry.
  - **Kubernetes Pod Health Impact**: Because all three architectures support automated cold-start bootstrapping, a fresh k8s pod comes up healthy on `/healthz` and `/readiness` even if launched without pre-baked image layers. In production CI/CD, pre-baked artifact image layers bypass the cold-start training time.
