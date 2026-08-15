# WealthGenie - Project Status

## Verified, working components

| Component | Location | Details |
|---|---|---|
| **Design Tokens System** | [`reactapp/src/styles/tokens.css`](reactapp/src/styles/tokens.css) | Comprehensive CSS token system (4px/8px modular spacing, semantic dark mode palette, typography scale, radii, shadows, and glows) |
| **Frontend CSS Migration (17/17)** | [`reactapp/src/`](reactapp/src/) | 100% of the 17 CSS files migrated to design tokens with zero visual regressions and unified aesthetic |
| **Unified State Handling** | [`reactapp/src/components/StateMessages.jsx`](reactapp/src/components/StateMessages.jsx) | Standardized `LoadingState`, `ErrorState`, and `EmptyState` components with ARIA live regions (`role="status"`, `role="alert"`) |
| **Accessibility (0 Violations)** | [`reactapp/src/__tests__/a11y.test.jsx`](reactapp/src/__tests__/a11y.test.jsx) | Automated `axe-core` testing verifying 0 accessibility violations across all 5 audited core screens |
| **Playwright Full-Lifecycle E2E Suite** | [`reactapp/e2e/full-flow.spec.js`](reactapp/e2e/full-flow.spec.js) | Full end-to-end integration test (Signup -> Profile -> Recommendations & DeepDive -> Goal Planning -> GenieChat grounded advice) passing in 17.4s |
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
| [`scripts/docs/check_docs_sync.js`](scripts/docs/check_docs_sync.js) | Statically verifies README matches code |

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

### 2. CSS Migration Inventory (17/17 Migrated)
All 17 CSS files in the React frontend were audited, normalized, and fully migrated to CSS variables from `tokens.css`:
1. `src/index.css` (Tokens import, global reset, root variables)
2. `src/App.css` (Shell layout, global layout utilities)
3. `src/styles/components.css` (Shared buttons, cards, badges)
4. `src/components/Sidebar.css` (Sidebar navigation, active states, hover effects)
5. `src/components/AuthPage.css` (Login & registration forms, password checklist)
6. `src/components/ProfilePage.css` (Financial profile builder, CTC sliders)
7. `src/components/GenieChat.css` (AI chat widget, message bubbles, action pills)
8. `src/components/GoalTracker.css` (Goal cards, progress meters, HUD metrics)
9. `src/components/AllocationPlanner.css` (Asset allocation dials, pie charts, sliders)
10. `src/components/TaxScreen.css` (Tax regime tables, deduction sliders, verdict cards)
11. `src/components/PostTaxAnalysis.css` (Post-tax analytics cards, holding period toggles)
12. `src/components/RebalancerScreen.css` (Rebalance sliders, trade summary tables)
13. `src/components/StepUpPlanner.css` (SIP step-up simulator, growth boost cards)
14. `src/components/HealthScoreScreen.css` (Health score gauge, diagnostic cards)
15. `src/components/DeepDiveModal.css` (Deep-dive dialog overlay, metrics grid)
16. `src/components/FeedbackBanner.css` (User feedback banner, star ratings)
17. `src/components/ComparisonTable.css` (Multi-instrument comparison table)

*Status*: **17/17 migrated (100%)**. Zero files left unmigrated.

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

### 4. Playwright End-to-End Suite & CI Integration Status
- **Test File**: `reactapp/e2e/full-flow.spec.js` (Playwright configuration in `reactapp/playwright.config.js`).
- **Flow Verified**:
  1. **Signup**: Creates new account with password validation and mobile checks.
  2. **Profile Completion**: Fills monthly take-home, savings, age, tax regime, and auto-scales CTC.
  3. **Recommendations & Deep Dive**: Verifies ranked investment cards mount; opens `DeepDiveModal` and dismisses it.
  4. **Goal Planning**: Creates a target goal through the 3-step wizard and verifies Monte Carlo projections.
  5. **GenieChat**: Asks a grounded financial question and verifies AI streaming response.
- **Runtime**: **17.4s** executed against live Express (5000), Python FastAPI ML (8000), MongoDB (27017), and Vite (5173).
- **CI Integration Status Disclosure**:
  > **Note**: The Playwright E2E suite is configured for local and pre-release test runs via `npm run test:e2e`. **It is explicitly NOT wired into the GitHub Actions automated CI workflow (`.github/workflows/ci.yml`)** because the CI matrix runs isolated headless unit tests and does not spin up the multi-container live stack (Vite + Express + FastAPI + Mongo + Redis) required for full browser testing.

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
