# WealthGenie - Project Status

## Verified, working components

| Component | Location | Details |
|---|---|---|
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
- **Model Version Registry Live Wiring (Resolved Gap)**: The model version registry (`mongo_registry_store.py`, `registry_store.py`, SHA-256 tamper-evident integrity, and rollback) previously existed and was tested in isolation, but had not been wired into the running FastAPI application lifespan (models were loaded from hardcoded static paths on startup). This gap has been fixed: `main.py` now instantiates the registry through `store_factory.py`, resolves active versions, artifacts, and rigor metrics dynamically upon startup, and exposes live HTTP endpoints (`/model/registry/versions`, `/model/registry/active`, `/model/registry/integrity/{id}`, `/model/registry/register`, `/model/registry/rollback/{id}`) with hot reload support.
