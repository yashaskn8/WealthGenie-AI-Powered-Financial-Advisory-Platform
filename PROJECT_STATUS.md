# WealthGenie — Project Status

> **Final state**: v1.0-final. This document is the single source of truth for what works, what doesn't, and what was explicitly deferred.

---

## Verified, working components

| Component | Evidence | Key Metrics |
| :--- | :--- | :--- |
| **Random Forest classifier** | Production-serving `model.pkl` with TreeSHAP explainability | 95.63% accuracy, 0.9144 Macro-F1 |
| **FT-Transformer benchmark** | [`multi_model_benchmark.json`](ml-service/reports/multi_model_benchmark.json) | 97.05% accuracy, 0.9331 Macro-F1 |
| **RAG pipeline** | Live-wired into Express chat via [`intentGate.js`](server/services/intentGate.js) → [`ragClient.js`](server/services/ragClient.js) → FastAPI `/rag/query` | In-domain Recall@4: 96.0%, MRR: 0.9600 |
| **Embedding ablation study** | [`embedding_ablation.json`](ml-service/reports/embedding_ablation.json) | Semantic vs hash: +2.0% Recall, +0.09 MRR |
| **Base LLM evaluation** | [`llm_eval_report.json`](ml-service/reports/llm_eval_report.json) | BLEU 0.028, ROUGE-L 0.284, Semantic Sim 0.666 |
| **Fail-closed auth** | [`test_fail_closed_auth_when_api_key_unset`](ml-service/tests/test_ml_validation.py) | HTTP 500 when `ML_SERVICE_API_KEY` unset in non-local env |
| **Docs-sync CI check** | [`scripts/docs/check_docs_sync.js`](scripts/docs/check_docs_sync.js) | Statically verifies README matches code |

---

## Known, disclosed limitations — not fixed, and that's fine

- **LoRA/QLoRA fine-tuning**: interface exists in code, but is not functional. Deferred indefinitely due to CPU compute constraints. Phase 4 evaluation was run against the base (non-fine-tuned) `Qwen/Qwen2.5-0.5B-Instruct` model.
- **No computer vision / VLM component**, by design — the platform covers tabular ML, text RAG, and regulatory advisory only. Vision work is a separate project.
- **RAG eval "\_all" aggregate metrics are inflated** by out-of-domain negative controls scoring vacuous 1.0s — the in-domain numbers (96% Recall@4, 0.9600 MRR) are the honest ones.
- **Observed retrieval miss**: an 80C/ELSS query returned an 80CCD/NPS citation in a passing integration test — known, not investigated further.
- **Multi-process scaling test** is a local single-host worker process load simulation, not a multi-host container cluster benchmark.
- **`investment_master.json` physical duplication**: Identical copies currently exist at `reactapp/src/data/investment_master.json` and `server/data/investment_master.json` — documented as a known, undone structural item (no build-time single-source-of-truth merging attempted in this pass).

---

## What was fixed during final review

1. **Silent metric duplication bug**: `compute_embedding_semantic_similarity()` imported from a nonexistent module path (`rag.embeddings.provider`), silently fell back to lexical overlap via a bare `except Exception:`. Every "semantic similarity" score in the eval report (0.4998) was actually the lexical overlap score under a different label. Fixed by correcting the import to `rag.embeddings.dense_embedding.SentenceTransformerEmbeddingProvider`. True semantic score: **0.6660**.
2. **Fail-open authentication**: `verify_api_key()` returned `"dev-mode"` when `ML_SERVICE_API_KEY` was unset, silently disabling auth in any environment. Now fails closed (HTTP 500) unless `ENVIRONMENT=local` is explicitly set.
3. **Mislabeled BERTScore metric**: `compute_bertscore_approx()` was a Jaccard word-overlap function, not BERTScore. Renamed to `compute_lexical_overlap_score()`.
4. **RAG integration test brittleness**: Test hard-failed when FastAPI ML service was offline. Updated to verify graceful fallback behavior instead.

---

## File reference

| File | Purpose |
| :--- | :--- |
| [`RESEARCH_LOG.md`](RESEARCH_LOG.md) | Full engineering and research narrative |
| [`README.md`](README.md) | Architecture, stack, transparency disclosure |
| [`ml-service/reports/`](ml-service/reports/) | All persisted benchmark JSON reports |
| [`ml-service/tests/test_ml_validation.py`](ml-service/tests/test_ml_validation.py) | ML validation test suite (9 pass, 2 skip) |
| [`server/test/ragIntegration.test.js`](server/test/ragIntegration.test.js) | RAG integration test (2 pass) |
| [`scripts/docs/check_docs_sync.js`](scripts/docs/check_docs_sync.js) | Static docs-vs-code sync checker |
