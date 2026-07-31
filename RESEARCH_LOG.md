# WealthGenie Engineering & Research Log

This log documents the empirical research, system architecture, performance benchmarks, and production integrity fixes implemented across the WealthGenie platform. Every claim in this document maps directly to a committed code module or persisted JSON report in the repository.

---

## 1. What I Built and Verified

1. **Hybrid RAG Integration into Express Product Gateway (Phase 1)**
   - **Implementation**: Built [`server/services/intentGate.js`](server/services/intentGate.js) and [`server/services/ragClient.js`](server/services/ragClient.js) to classify user questions. Factual tax, mutual fund, and regulatory turns route to the FastAPI `/rag/query` pipeline; conversational turns route to Gemini/Groq LLM adapters.
   - **Verification**: Verified via `server/test/ragIntegration.test.js` (100% pass rate, returning inline citations mapped directly to seed knowledge chunk IDs).

2. **Empirical RAG Subsystem Evaluation (Phase 2)**
   - **Implementation**: Evaluated `SentenceTransformer` (`all-MiniLM-L6-v2`) 384D vector search across 35 hand-labeled test queries (25 in-domain tax & regulatory queries + 10 out-of-domain negative controls).
   - **Committed Report**: [`ml-service/reports/rag_eval_report.json`](ml-service/reports/rag_eval_report.json) (In-Domain Recall@4: **96.0%**, In-Domain MRR: **0.9600**, Citation Accuracy: **100.0%**, Mean Grounding Score: **0.7716**).

3. **Real Multi-Model Deep Learning Benchmark (Phase 3)**
   - **Implementation**: Trained and evaluated **Random Forest**, **PyTorch MLP**, and **FT-Transformer** (*NeurIPS 2021*) on the exact same 20,000 NAV-derived investor profile dataset (16 canonical features, identical 60/20/20 train/val/test split).
   - **Committed Report & Checkpoints**: [`ml-service/reports/multi_model_benchmark.json`](ml-service/reports/multi_model_benchmark.json) and checkpoints [`mlp_benchmark.pt`](ml-service/model/checkpoints/mlp_benchmark.pt) & [`ft_transformer_benchmark.pt`](ml-service/model/checkpoints/ft_transformer_benchmark.pt).
   - **Results**: FT-Transformer achieved **97.05%** accuracy (**0.9331** Macro-F1) vs Random Forest **95.63%** accuracy (**0.9144** Macro-F1). Random Forest trained 19x faster (4.16s vs 79.15s) and matched balanced accuracy (**0.9221** vs **0.9220**).

4. **Base LLM Evaluation Harness (Phase 4)**
   - **Implementation**: Evaluated base open-weight `Qwen/Qwen2.5-0.5B-Instruct` across 25 financial advisory prompts against hand-labeled gold reference answers.
   - **Committed Report**: [`ml-service/reports/llm_eval_report.json`](ml-service/reports/llm_eval_report.json) (Mean BLEU: **0.0278**, Mean ROUGE-L: **0.2844**, Mean Lexical Overlap: **0.4998**, Mean Semantic Embedding Similarity: **0.4998**, Mean Faithfulness: **0.5608**). Includes worst 3 failure cases with root-cause analysis (lack of domain grounding without RAG).

---

## 2. What I Investigated and What I Found

### Embedding Provider Ablation Study (Phase 5)

I conducted an ablation study comparing the lightweight hash-based n-gram bucket provider ([`DenseVectorEmbeddingProvider`](ml-service/rag/embeddings/dense_embedding.py)) against the production transformer model ([`SentenceTransformerEmbeddingProvider`](ml-service/rag/embeddings/dense_embedding.py)) across the 35 evaluation queries.

- **Committed Report**: [`ml-service/reports/embedding_ablation.json`](ml-service/reports/embedding_ablation.json)

#### Empirical Comparison Summary:

| Metric | Hash Provider (`DenseVectorEmbeddingProvider`) | Semantic Provider (`all-MiniLM-L6-v2`) | Empirical Uplift |
| :--- | :---: | :---: | :---: |
| **Vector Dimension** | 128D (character n-gram hash) | 384D (transformer dense vector) | +256 dimensions |
| **In-Domain Recall@4** | 98.0% | **100.0%** | **+2.0%** |
| **In-Domain Hit Rate** | 100.0% | **100.0%** | 0.0% |
| **Mean Reciprocal Rank (MRR)** | 0.8833 | **0.9733** | **+0.0900** |
| **Mean NDCG@4** | 0.8975 | **0.9800** | **+0.0825** |
| **Execution Time (35 queries)** | 0.03s | 0.52s | +0.49s |

#### Key Investigation Findings:
1. **Semantic Uplift**: Switching to dense transformer embeddings improved Mean Reciprocal Rank by **+0.0900** (from 0.8833 to 0.9733) and NDCG@4 by **+0.0825** (from 0.8975 to 0.9800), ensuring relevant chunks rank higher in search results.
2. **Failure Mode Analysis**: Character n-gram hashing fails on query paraphrases that do not share exact lexical root words with the knowledge base chunk (e.g. Query 21: *"Can I claim ELSS investments under Section 80C under Old Tax Regime?"*), retrieving only 1 of 2 relevant chunks (Recall@4 = 0.50). The dense semantic embedder captures context, retrieving both chunks (Recall@4 = 1.00).

---

## 3. What I Fixed After Finding It Was Wrong

1. **Fail-Open Authentication Vulnerability**
   - **Problem**: `verify_api_key()` in `ml-service/main.py` previously checked `if not expected_key: return api_key or "dev-mode"`, silently disabling authentication whenever `ML_SERVICE_API_KEY` was unset in any environment.
   - **Fix**: Updated `verify_api_key()` to fail closed by default. An explicit `ENVIRONMENT=local` env flag is now mandatory to permit dev-mode bypass when `ML_SERVICE_API_KEY` is unset. Non-local environments return HTTP 500 (misconfiguration error). Verified by [`test_fail_closed_auth_when_api_key_unset`](ml-service/tests/test_ml_validation.py#L231).

2. **Mislabeled Metric (`compute_bertscore_approx`)**
   - **Problem**: `compute_bertscore_approx()` in `ml-service/llm/evaluation/metrics.py` computed a rescaled Jaccard word-overlap score (surface n-gram token overlap) while claiming to approximate BERTScore.
   - **Fix**: Renamed the function to [`compute_lexical_overlap_score()`](ml-service/llm/evaluation/metrics.py#L102), updated docstrings to explicitly state it measures surface lexical overlap, and added [`compute_embedding_semantic_similarity()`](ml-service/llm/evaluation/metrics.py#L128) using SentenceTransformer 384D vector cosine similarity.

3. **Horizontal Scaling Claims & Disclosure Honesty**
   - **Problem**: Prior documentation could be interpreted as claiming multi-host container cluster infrastructure.
   - **Fix**: Clarified in `README.md` and `RESEARCH_LOG.md` that horizontal scaling tests represent local single-host multi-process load simulations using worker processes.

4. **Documentation & Code Sync CI Check**
   - **Problem**: Architecture claims in documentation could silently drift from backend code implementation.
   - **Fix**: Created [`scripts/check_docs_sync.js`](scripts/check_docs_sync.js) which statically inspects `server/services/geminiChatService.js`, `server/services/ragClient.js`, and `ml-service/main.py` to enforce that docs match code logic before CI passes.

---

## 4. What Is Explicitly Out of Scope Right Now

1. **LoRA / QLoRA Fine-Tuning**
   - **Status**: Out of scope for this evaluation pass.
   - **Reason**: Evaluation in Phase 4 was conducted on the base open-weight `Qwen/Qwen2.5-0.5B-Instruct` model to establish a clean, non-fine-tuned performance baseline. Fine-tuning pipelines were excluded due to CPU compute constraints.

2. **Computer Vision / VLM (Vision-Language Models)**
   - **Status**: Out of scope.
   - **Reason**: The WealthGenie platform is designed strictly for tabular investor suitability classification, text-based financial RAG, and regulatory advisory. Image processing and vision capabilities are not relevant to the problem domain.
