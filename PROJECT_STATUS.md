# WealthGenie — Project Status

> **Final state**: v1.0-final. This document is the single source of truth for what works, what doesn't, and what was explicitly deferred.

---

## Verified, working components

| Component | Evidence | Key Metrics |
| :--- | :--- | :--- |
| **Random Forest classifier** | Production-serving `model.pkl` with TreeSHAP explainability | 95.63% rule-approx. fidelity (independent CFP benchmark: 25.26%) |
| **FT-Transformer benchmark** | [`multi_model_benchmark.json`](ml-service/reports/multi_model_benchmark.json) | 97.05% rule-approx. fidelity (independent CFP benchmark: 15.83%) |
| **RAG pipeline** | Live-wired into Express chat via [`intentGate.js`](server/services/intentGate.js) ➔ [`ragClient.js`](server/services/ragClient.js) ➔ FastAPI `/rag/query` | 508-chunk real corpus (Tax, SEBI, RBI/DICGC), FAISS `IndexFlatIP` vector store, 75-query eval ([`real_corpus_evaluation_report.json`](ml-service/reports/real_corpus_evaluation_report.json)): 98.7% document hit rate, Precision@4 0.7367, MRR 0.9022, NDCG@4 0.7564, 31.7ms avg latency |
| **Embedding ablation study** | [`embedding_ablation.json`](ml-service/reports/embedding_ablation.json) | Semantic vs hash: +2.0% Recall, +0.09 MRR |
| **Base LLM evaluation** | [`llm_eval_report.json`](ml-service/reports/llm_eval_report.json) | BLEU 0.028, ROUGE-L 0.284, Semantic Sim 0.666 |
| **Fail-closed auth** | [`test_fail_closed_auth_when_api_key_unset`](ml-service/tests/test_ml_validation.py) | HTTP 500 when `ML_SERVICE_API_KEY` unset in non-local env |
| **MLOps Registry & Drift** | [`ml-service/model/registry/`](ml-service/model/registry/) | SQLite/MongoDB registry, tamper-evident rollback (SHA-256), PSI feature drift monitor |
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

## Known, disclosed limitations — not fixed, and that's fine

- **Vector search in-memory after Mongo load**: MongoDB 7.0 Community Edition does not support Atlas Vector Search. Chunks are persisted in MongoDB for cross-replica storage, but FAISS/NumPy similarity search runs in-memory after loading vectors from Mongo on startup.
- **Per-replica memory scaling bottleneck**: Because vector search runs in-memory, every ML service replica loads the full embedding matrix into local RAM. For large corpora, memory consumption scales linearly with N_replicas x N_chunks.
- **DAG crash recovery scope**: Redis Streams persistence allows resuming a deterministic step DAG from the last completed step index. Non-deterministic external tool mutations without rollback/compensating transactions are not handled by a full distributed saga orchestrator.
- **Rate limiter in-memory fallback**: `passOnStoreError: false` is enforced for `authLimiter` (fail-closed), but `apiLimiter` still falls back to in-memory `Map` counters if Redis disconnects, effectively multiplying rate limits across independent replicas during an outage.
- **LoRA/QLoRA fine-tuning**: interface exists in code, but is not functional. Deferred indefinitely due to CPU compute constraints. Phase 4 evaluation was run against the base (non-fine-tuned) `Qwen/Qwen2.5-0.5B-Instruct` model.
- **No computer vision / VLM component**, by design — the platform covers tabular ML, text RAG, and regulatory advisory only. Vision work is a separate project.
- **RAG eval "_all" aggregate metrics are inflated** by out-of-domain negative controls scoring vacuous 1.0s — the in-domain numbers (96% Recall@4, 0.9600 MRR) are the honest ones.
- **Observed retrieval miss**: an 80C/ELSS query returned an 80CCD/NPS citation in a passing integration test — known, not investigated further.
- **Multi-process scaling test** is a local single-host worker process load simulation, not a multi-host container cluster benchmark.
- **`investment_master.json` physical duplication**: Identical copies currently exist at `reactapp/src/data/investment_master.json` and `server/data/investment_master.json` — documented as a known, undone structural item.

---

## What was fixed during final review

1. **Silent metric duplication bug**: `compute_embedding_semantic_similarity()` imported from a nonexistent module path (`rag.embeddings.provider`), silently fell back to lexical overlap via a bare `except Exception:`. Every "semantic similarity" score in the eval report (0.4998) was actually the lexical overlap score under a different label. Fixed by correcting the import to `rag.embeddings.dense_embedding.SentenceTransformerEmbeddingProvider`. True semantic score: **0.6660**.
2. **Fail-open authentication**: `verify_api_key()` returned `"dev-mode"` when `ML_SERVICE_API_KEY` was unset, silently disabling auth in any environment. Now fails closed (HTTP 500) unless `ENVIRONMENT=local` is explicitly set.
3. **Mislabeled BERTScore metric**: `compute_bertscore_approx()` was a Jaccard word-overlap function, not BERTScore. Renamed to `compute_lexical_overlap_score()`.
4. **RAG integration test brittleness**: Test hard-failed when FastAPI ML service was offline. Updated to verify graceful fallback behavior instead.
5. **MLOps Registry Metrics Sourcing**: `register_model.py` previously read rule-approximation fidelity from `rigor_evaluation_report.json`'s full-dataset audit key instead of `multi_model_benchmark.json`'s test split. Fixed to read test-set accuracy directly (RF: 0.9563, MLP: 0.9560, FT: 0.9705) and hardcoded exact assertions in `test_mlops_registry.py`.
6. **RAG Path Persistence Safety (WG-024)**: RAG conversation turns in `geminiChatService.js` are persisted without attaching a `metadata.provider` key, preventing Mongoose provider enum validation exceptions (`['gemini', 'groq', 'local_fallback']`). Verified via `server/test/ragIntegration.test.js`.
7. **Recommendation Engine Architectural Gaps (WG-030)**: Three untracked gaps in the recommendation and ranking pipelines — (a) `CONCENTRATION_CAPS` declared in `investmentDatabase.js` but never enforced, allowing single-instrument allocations to exceed policy limits; (b) live market data pipeline (`getLiveInstrumentParams`) connected to the cache layer but never wired into `POST /api/recommend` or `computeInstrumentScore`, so return scoring always used static catalog rates; (c) `rankWhereToInvestBackend` used hardcoded default risk=5 for all candidates instead of looking up the authoritative `investmentDatabase` catalog risk level. Fixed in commits `4d58720`, `97d97e6`, `1833833`.
8. **RAG Corpus Live-Fetch Provenance Correction**: The initial corpus provenance manifest (`corpus_sources.md`) contained an invalid SEBI circular URL (`_89320.html`) and synthetic batch timestamps. Corrected by sourcing live SEBI circular `99983` PDF, PIB tax releases for Budget 2025-26, and live DICGC guide.
9. **RAG Evaluation Self-Referential Scoring Bug**: The evaluation harness passed `ground_truth_chunk_ids=None`, comparing retrieved chunks against *themselves* (trivially scoring 1.0000). Fixed by supplying document-level ground truth from `expected_source` and removing silent fallback. Corrected metrics: Precision@4 = 0.7367, MRR = 0.9022, Hit Rate = 0.9867, NDCG@4 = 0.7564.
10. **RAG Prompt Injection Semantic Generalization & Evaluation Circularity Correction**: Replaced circular test-anchor pairs with external public attack datasets (`pr1m8`, `PayloadsAllTheThings`, `TakSec`) and a 30-query legitimate financial false-positive test suite (FPR: 0.0%). Added `fail_closed_on_model_error=True` to prevent silent bypasses during embedding model failures.
11. **Distributed Systems State Migration, DAG Crash-Resume & Fail-Closed Security**:
   - **MongoDB Shared ML/RAG State**: Replaced local SQLite (`model_registry.db`) and local JSON vector indexes with `MongoModelRegistry` and `MongoVectorStore`, dynamically activated via `store_factory.py` when `MONGODB_URI` is present. Verified multi-replica shared state in `verify_cross_replica_mongo.py` (14/14 unit tests pass).
   - **Redis Streams DAG Step Persistence & Crash-Resume**: Created `server/services/dagStream.js` to log each agent DAG step with SHA-256 input/output hashes. Added `resumeWorkflow()` to resume crashed workflows from the last completed step index without repeating earlier steps (verified via `server/test/dagStream.test.js`).
   - **Fail-Closed Security Fixes**: Fixed silent fail-open bug in `isTokenBlacklisted()` so revoked tokens are denied by default when Redis is unavailable. Set `passOnStoreError: false` on `authLimiter` to fail closed against brute-force attacks during store outages (verified via `server/test/failClosed.test.js`).
   - **Idempotency & Dead-Letter Queue**: Added step-level idempotency caching by input hash and automatic DLQ routing (`stream:dag:dead_letter`) for steps failing 3+ retries, managed by `DeadLetterProcessor` (verified via `server/test/idempotency.test.js`).
   - **1-Replica vs 2-Replica Benchmark**: Benchmarked 1 standalone replica (7,676 req/s compute) vs 2 load-balanced replicas (5,025 req/s compute) with 0.00% error rate, documenting the single-host socket hop cost in `load_test_report.md`.

---

## AI Security Hardening (post-v1.0)

| Layer | Implementation | Test Evidence |
| :--- | :--- | :--- |
| **Ingestion Trust Tiering** | [`pipeline.py`](ml-service/rag/ingestion/pipeline.py) — only documents from pre-approved gov domains (SEBI, RBI, DICGC, Income Tax India) are auto-ingested; untrusted sources require explicit `manual_override=True` | [`test_rag_trust_tiering.py`](ml-service/tests/test_rag_trust_tiering.py) — 3/3 pass |
| **Corpus Poisoning Defense** | End-to-end pipeline test proving poisoned/injected documents are neutralized before reaching the prompt builder | [`test_rag_poisoning_pipeline.py`](ml-service/tests/test_rag_poisoning_pipeline.py) — 1/1 pass |
| **Semantic Injection Guard** | [`prompt_sanitizer.py`](ml-service/rag/security/prompt_sanitizer.py) — multi-layer defense: regex blacklist + semantic paraphrase detection + Base64 payload decoding | [`test_rag_security_redteam.py`](ml-service/tests/test_rag_security_redteam.py) (6/6 pass) + [`test_rag_security_generalization.py`](ml-service/tests/test_rag_security_generalization.py) (4/4 pass) |
| **Consolidated Security Patterns** | [`config/security_patterns.json`](config/security_patterns.json) — single source of truth for injection patterns shared between Node.js and Python | Both `promptSecurity.js` and `prompt_sanitizer.py` load from this file |
| **Per-User Token Budget** | [`tokenBudget.js`](server/middleware/tokenBudget.js) — rolling-window token budget middleware on `POST /api/chat/message` | [`tokenBudgetMiddleware.test.js`](server/test/tokenBudgetMiddleware.test.js) — 5/5 pass |
| **Fail-Closed Blacklist & Auth Rate Limit** | [`redis.js`](server/config/redis.js) & [`rateLimiter.js`](server/middleware/rateLimiter.js) — fail closed during Redis outage | [`failClosed.test.js`](server/test/failClosed.test.js) — 5/5 pass |

---

## File reference

| File | Purpose |
| :--- | :--- |
| [`ml-service/model/registry/mongo_registry_store.py`](ml-service/model/registry/mongo_registry_store.py) | MongoDB-backed MLOps Model Registry |
| [`ml-service/rag/vector_store/mongo_vector_store.py`](ml-service/rag/vector_store/mongo_vector_store.py) | MongoDB-backed RAG Vector Store with in-memory FAISS search |
| [`ml-service/store_factory.py`](ml-service/store_factory.py) | Factory resolving MongoDB vs SQLite/local disk state dynamically |
| [`ml-service/scripts/verify_cross_replica_mongo.py`](ml-service/scripts/verify_cross_replica_mongo.py) | Standalone verification script proving cross-replica state sharing |
| [`server/services/dagStream.js`](server/services/dagStream.js) | Redis Streams agent DAG step persistence, crash-resume, and idempotency |
| [`server/services/deadLetterProcessor.js`](server/services/deadLetterProcessor.js) | Monitoring and remediation utility for dead-lettered agent workflows |
| [`server/scripts/loadtest_replicas.js`](server/scripts/loadtest_replicas.js) | 1-replica vs 2-replica scalability load benchmark runner |
| [`load_test_report.md`](load_test_report.md) | Comprehensive load test report with single vs multi-replica scaling data |
| [`server/test/dagStream.test.js`](server/test/dagStream.test.js) | Unit test suite verifying DAG persistence and crash resume |
| [`server/test/failClosed.test.js`](server/test/failClosed.test.js) | Unit test suite verifying fail-closed security invariants |
| [`server/test/idempotency.test.js`](server/test/idempotency.test.js) | Unit test suite verifying idempotency deduplication and DLQ routing |
