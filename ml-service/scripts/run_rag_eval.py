# ruff: noqa: E402
"""
WealthGenie RAG Evaluation Suite
Executes empirical RAG evaluation against hand-labeled ground truth queries,
calculates textbook retrieval & grounding metrics, and persists ml-service/reports/rag_eval_report.json.
"""

import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Set

# Ensure sys.stdout handles UTF-8 on Windows PowerShell
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# Ensure ml-service is in sys.path
ML_SERVICE_DIR = Path(__file__).resolve().parents[1]
if str(ML_SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(ML_SERVICE_DIR))

from rag.config import RAGConfig
from rag.embeddings.dense_embedding import SentenceTransformerEmbeddingProvider
from rag.ingestion.pipeline import IngestionPipeline
from rag.retrieval.pipeline import RAGPipeline
from rag.schema import RAGQueryRequest
from rag.evaluation.evaluator import RAGEvaluator
from rag.vector_store.memory_vector_store import PersistentVectorStore

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("wealthgenie.rag.run_eval")


# Authoritative Knowledge Base Documents
KNOWLEDGE_DOCUMENTS = [
    {
        "doc_id": "doc_tax_regulations_2025",
        "title": "Indian Income Tax Regulations FY 2025-26",
        "content": """# Indian Progressive Income Tax Regulations FY 2025-26 (AY 2026-27)

## New Tax Regime (Section 115BAC Default)
Under the New Tax Regime for FY 2025-26, income tax slabs and marginal rates are structured as follows:
- Income up to Rs 4,00,000: NIL (0%)
- Income Rs 4,00,001 to Rs 8,00,000: 5%
- Income Rs 8,00,001 to Rs 12,00,000: 10%
- Income Rs 12,00,001 to Rs 16,00,000: 15%
- Income Rs 16,00,001 to Rs 20,00,000: 20%
- Income Rs 20,00,001 to Rs 24,00,000: 25%
- Income above Rs 24,00,000: 30%

### Standard Deduction & Section 87A Rebate
- **Standard Deduction**: Salaried individuals receive a standard deduction of Rs 75,000 under the New Regime.
- **Section 87A Rebate**: Full tax rebate applies for taxable income up to Rs 12,00,000 under the New Tax Regime, resulting in zero net tax liability. Marginal relief is granted for incomes marginally exceeding Rs 12 Lakhs.

## Old Tax Regime
The Old Tax Regime offers deductions under Section 80C, 80D, 80CCD(2), and HRA:
- Income up to Rs 2,50,000: NIL (0%)
- Income Rs 2,50,001 to Rs 5,00,000: 5%
- Income Rs 5,00,001 to Rs 10,00,000: 20%
- Income above Rs 10,00,000: 30%

### Deductions Breakdown
- **Section 80C**: Maximum deduction of Rs 1,50,000 for ELSS mutual funds, PPF, EPF, and principal home loan repayment.
- **Section 80D**: Health insurance premium deduction up to Rs 25,000 for self/family and Rs 50,000 for senior citizen parents.
- **Section 80CCD(1B)**: Additional NPS contribution deduction up to Rs 50,000.
- **Section 80CCD(2)**: Employer contribution to NPS deduction up to 14% of basic salary for Central Govt employees and 10% for private sector.
""",
    },
    {
        "doc_id": "doc_mutual_funds_suitability",
        "title": "SEBI & AMFI Mutual Fund Classification & Risk Suitability",
        "content": """# SEBI & AMFI Mutual Fund Classification & Risk Suitability

## Equity Mutual Funds
- **Flexi Cap / Large Cap Funds**: Suitable for long-term wealth accumulation (>5 years horizon). Higher risk capacity (>0.50). High return expectation (12-15% CAGR).
- **ELSS (Equity Linked Savings Scheme)**: Equity mutual fund with a 3-year mandatory lock-in period. Offers tax deduction under Section 80C up to Rs 1.5 Lakhs in Old Regime.

## Debt & Fixed Income Funds
- **Liquid & Money Market Funds**: Suitable for emergency funds and short-term liquidity (<1 year horizon). Low risk capacity. Capital preservation priority.
- **Short Duration / Corporate Bond Funds**: Moderate risk, suitable for 1-3 year investment horizons.

## Fixed Deposits & Government Bonds
- **Bank Fixed Deposits (FD)**: Guaranteed return instrument. Covered by DICGC insurance up to Rs 5 Lakhs per bank per depositor. Suitable for conservative risk profiles.
- **RBI Floating Rate Savings Bonds**: 7-year lock-in period, sovereign guarantee, interest reset semi-annually. Zero credit risk.
- **Senior Citizens Savings Scheme (SCSS)**: 5-year tenure, max investment limit Rs 30 Lakhs, offers quarterly interest payout for individuals above 60 years.
- **Sovereign Gold Bonds (SGB)**: 8-year tenure, 2.5% annual coupon interest, capital gains tax exempt if held until maturity.
""",
    },
]


def run_eval():
    logger.info("Initializing RAG Evaluation Run...")

    embedder = SentenceTransformerEmbeddingProvider(enable_cache=False)
    vector_store = PersistentVectorStore()

    # Clear and re-ingest test knowledge documents to ensure deterministic chunk mapping
    vector_store._chunks.clear()

    pipeline = IngestionPipeline(embedder=embedder, vector_store=vector_store)

    for doc in KNOWLEDGE_DOCUMENTS:
        pipeline.ingest_text(doc["content"], title=doc["title"], source=doc["doc_id"])

    # Extract chunk IDs by matching title and chunk index
    tax_chunks = [c for c in vector_store._chunks if c.metadata.title == "Indian Income Tax Regulations FY 2025-26"]
    mf_chunks = [c for c in vector_store._chunks if c.metadata.title == "SEBI & AMFI Mutual Fund Classification & Risk Suitability"]

    # Tax Chunks:
    # tax_chunks[0]: New Regime Slabs
    # tax_chunks[1]: Standard Deduction Rs 75k, Sec 87A rebate & marginal relief
    # tax_chunks[2]: Old Regime Slabs, Sec 80C, Sec 80D
    # tax_chunks[3]: Sec 80CCD(1B), Sec 80CCD(2) NPS

    # Mutual Fund Chunks:
    # mf_chunks[0]: Flexi Cap, ELSS 3-year lock-in
    # mf_chunks[1]: Liquid funds, Short Duration, Bank FDs DICGC insurance
    # mf_chunks[2]: RBI Bonds 7-yr, SCSS 5-yr, SGB 8-yr

    c_tax_slabs = tax_chunks[0].chunk_id if len(tax_chunks) > 0 else ""
    c_tax_rebate = tax_chunks[1].chunk_id if len(tax_chunks) > 1 else ""
    c_tax_80c_80d = tax_chunks[2].chunk_id if len(tax_chunks) > 2 else ""
    c_tax_nps = tax_chunks[3].chunk_id if len(tax_chunks) > 3 else ""

    c_mf_elss = mf_chunks[0].chunk_id if len(mf_chunks) > 0 else ""
    c_mf_fd = mf_chunks[1].chunk_id if len(mf_chunks) > 1 else ""
    c_mf_bonds = mf_chunks[2].chunk_id if len(mf_chunks) > 2 else ""

    logger.info(f"Tax Chunks Map: slabs={c_tax_slabs}, rebate={c_tax_rebate}, 80c={c_tax_80c_80d}, nps={c_tax_nps}")
    logger.info(f"MF Chunks Map: elss={c_mf_elss}, fd={c_mf_fd}, bonds={c_mf_bonds}")

    # 35 Hand-Labeled Test Queries covering Factual, Regulatory, Suitability, and Negative Control topics
    EVALUATION_DATASET = [
        # --- Tax Laws & Section 115BAC / 87A ---
        {
            "query": "What are the income tax slabs under the New Tax Regime for FY 2025-26?",
            "ground_truth_ids": {c_tax_slabs},
        },
        {
            "query": "What is the Section 87A rebate limit under the New Tax Regime?",
            "ground_truth_ids": {c_tax_rebate},
        },
        {
            "query": "How much standard deduction is allowed for salaried employees under the New Regime?",
            "ground_truth_ids": {c_tax_rebate},
        },
        {
            "query": "Is there a marginal relief for income marginally exceeding 12 Lakhs under Section 87A?",
            "ground_truth_ids": {c_tax_rebate},
        },
        {
            "query": "What are the Old Tax Regime slabs for FY 2025-26?",
            "ground_truth_ids": {c_tax_80c_80d},
        },

        # --- Section 80C, 80D, 80CCD Deductions ---
        {
            "query": "What is the maximum deduction allowed under Section 80C?",
            "ground_truth_ids": {c_tax_80c_80d},
        },
        {
            "query": "What are the deduction limits for health insurance under Section 80D for senior citizens?",
            "ground_truth_ids": {c_tax_80c_80d},
        },
        {
            "query": "How much additional tax deduction is available under Section 80CCD(1B) for NPS?",
            "ground_truth_ids": {c_tax_nps},
        },
        {
            "query": "What is employer contribution deduction under Section 80CCD(2)?",
            "ground_truth_ids": {c_tax_nps},
        },
        {
            "query": "Can PPF and EPF contributions be claimed under Section 80C?",
            "ground_truth_ids": {c_tax_80c_80d},
        },

        # --- Mutual Funds & Risk Suitability ---
        {
            "query": "What is the mandatory lock-in period for ELSS mutual funds?",
            "ground_truth_ids": {c_mf_elss},
        },
        {
            "query": "What is the recommended investment horizon for Flexi Cap equity funds?",
            "ground_truth_ids": {c_mf_elss},
        },
        {
            "query": "Which mutual funds are suitable for short-term liquidity under 1 year?",
            "ground_truth_ids": {c_mf_fd},
        },
        {
            "query": "What return expectation is associated with Flexi Cap equity funds?",
            "ground_truth_ids": {c_mf_elss},
        },
        {
            "query": "Are Short Duration funds suitable for 1-3 year horizons?",
            "ground_truth_ids": {c_mf_fd},
        },

        # --- Fixed Deposits & Sovereign Bonds ---
        {
            "query": "What is the DICGC insurance limit on bank fixed deposits?",
            "ground_truth_ids": {c_mf_fd},
        },
        {
            "query": "What is the tenure and lock-in for RBI Floating Rate Savings Bonds?",
            "ground_truth_ids": {c_mf_bonds},
        },
        {
            "query": "What is the maximum investment limit for Senior Citizens Savings Scheme SCSS?",
            "ground_truth_ids": {c_mf_bonds},
        },
        {
            "query": "Are capital gains on Sovereign Gold Bonds SGB exempt if held to maturity?",
            "ground_truth_ids": {c_mf_bonds},
        },
        {
            "query": "What annual coupon interest rate do Sovereign Gold Bonds pay?",
            "ground_truth_ids": {c_mf_bonds},
        },

        # --- Granular Cross-Domain Queries ---
        {
            "query": "Can I claim ELSS investments under Section 80C under Old Tax Regime?",
            "ground_truth_ids": {c_tax_80c_80d, c_mf_elss},
        },
        {
            "query": "What tax regime is default for FY 2025-26 assessment year 2026-27?",
            "ground_truth_ids": {c_tax_slabs},
        },
        {
            "query": "Does liquid fund carry low risk capacity?",
            "ground_truth_ids": {c_mf_fd},
        },
        {
            "query": "What is the tax slab for income above 24 Lakhs in New Regime?",
            "ground_truth_ids": {c_tax_slabs},
        },
        {
            "query": "How are bank FDs protected under DICGC?",
            "ground_truth_ids": {c_mf_fd},
        },

        # --- Negative Control / Out-Of-Domain / Hard Queries (Included honestly for realistic evaluation) ---
        {
            "query": "What is the tax rate on cryptocurrency and virtual digital assets under Section 115BBH?",
            "ground_truth_ids": set(), # Out of domain - should miss
        },
        {
            "query": "How are US stock investments taxed for Indian residents under DTAA?",
            "ground_truth_ids": set(), # Out of domain - should miss
        },
        {
            "query": "What is the indexation benefit calculation for real estate sold after 2 years?",
            "ground_truth_ids": set(), # Out of domain - should miss
        },
        {
            "query": "What is the minimum margin requirement for options trading in NSE derivatives?",
            "ground_truth_ids": set(), # Out of domain - should miss
        },
        {
            "query": "How is dividend income taxed for non-resident Indian NRI investors?",
            "ground_truth_ids": set(), # Out of domain - should miss
        },
        {
            "query": "What are the rules for Sovereign Wealth Fund tax exemption under Section 10(23FE)?",
            "ground_truth_ids": set(), # Out of domain - should miss
        },
        {
            "query": "What is the GST rate on term life insurance policies in India?",
            "ground_truth_ids": set(), # Out of domain - should miss
        },
        {
            "query": "What is the penalty for late filing of Income Tax Return ITR under Section 234F?",
            "ground_truth_ids": set(), # Out of domain - should miss
        },
        {
            "query": "What is the lock-in period for National Savings Certificates NSC?",
            "ground_truth_ids": set(), # Out of domain - should miss
        },
        {
            "query": "What are the tax implications of ESOP exercise for startup employees under Section 192?",
            "ground_truth_ids": set(), # Out of domain - should miss
        },
    ]

    rag_config = RAGConfig.from_env()
    query_pipeline = RAGPipeline(
        config=rag_config,
        embedder=embedder,
        vector_store=vector_store,
    )
    evaluator = RAGEvaluator()

    per_query_results = []

    total_coverage = 0.0
    total_diversity = 0.0
    citation_validity_sum = 0.0
    citation_validity_count = 0
    lexical_support_sum = 0.0
    lexical_support_count = 0
    correct_abstentions = 0
    abstention_controls = 0

    in_domain_recall_sum = 0.0
    in_domain_precision_sum = 0.0
    in_domain_mrr_sum = 0.0
    in_domain_hit_sum = 0.0
    in_domain_count = 0

    logger.info(f"Running evaluation over {len(EVALUATION_DATASET)} queries...")

    for idx, item in enumerate(EVALUATION_DATASET, 1):
        q: str = str(item["query"])
        gt_ids: Set[str] = set(item["ground_truth_ids"])

        req = RAGQueryRequest(question=q, top_k=4)
        resp = query_pipeline.query(req)

        eval_res = evaluator.evaluate_query_response(
            query=q,
            response=resp,
            ground_truth_chunk_ids=gt_ids,
            k=4,
        )

        metrics = eval_res["metrics"]

        retrieved_ids = [r.chunk.chunk_id for r in resp.retrieved_chunks]
        hit = any(rid in gt_ids for rid in retrieved_ids) if gt_ids else False

        if gt_ids:
            in_domain_count += 1
            in_domain_recall_sum += metrics["recall_at_4"]
            in_domain_precision_sum += metrics["precision_at_4"]
            in_domain_mrr_sum += metrics["mrr"]
            in_domain_hit_sum += metrics["hit_rate"]

        query_record = {
            "query_id": idx,
            "query": q,
            "ground_truth_chunk_ids": list(gt_ids),
            "ground_truth_chunk_count": len(gt_ids),
            "retrieved_chunk_ids": retrieved_ids,
            "hit_status": "HIT" if hit else ("OUT_OF_DOMAIN" if not gt_ids else "MISS"),
            "metrics": metrics,
            "citations_count": eval_res["citations_count"],
        }

        per_query_results.append(query_record)

        total_coverage += metrics["context_coverage"]
        total_diversity += metrics["chunk_diversity"]
        if metrics["citation_id_validity"] is not None:
            citation_validity_sum += metrics["citation_id_validity"]
            citation_validity_count += 1
        if metrics["lexical_support"] is not None:
            lexical_support_sum += metrics["lexical_support"]
            lexical_support_count += 1
        if metrics["abstention_correctness"] is not None:
            abstention_controls += 1
            correct_abstentions += int(metrics["abstention_correctness"])

    num_queries = len(EVALUATION_DATASET)

    aggregate_metrics = {
        "in_domain_recall_at_4": round(in_domain_recall_sum / in_domain_count, 4) if in_domain_count > 0 else 0.0,
        "in_domain_precision_at_4": round(in_domain_precision_sum / in_domain_count, 4) if in_domain_count > 0 else 0.0,
        "in_domain_mrr": round(in_domain_mrr_sum / in_domain_count, 4) if in_domain_count > 0 else 0.0,
        "in_domain_hit_rate": round(in_domain_hit_sum / in_domain_count, 4) if in_domain_count > 0 else 0.0,
        "mean_context_coverage": round(total_coverage / num_queries, 4),
        "mean_chunk_diversity": round(total_diversity / num_queries, 4),
        "mean_citation_id_validity": round(citation_validity_sum / citation_validity_count, 4) if citation_validity_count else None,
        "mean_lexical_support": round(lexical_support_sum / lexical_support_count, 4) if lexical_support_count else None,
        "abstention_correctness": round(correct_abstentions / abstention_controls, 4) if abstention_controls else None,
    }

    hits_count = sum(1 for q in per_query_results if q["hit_status"] == "HIT")
    misses_count = sum(1 for q in per_query_results if q["hit_status"] == "MISS")
    ood_count = sum(1 for q in per_query_results if q["hit_status"] == "OUT_OF_DOMAIN")

    final_report = {
        "report_name": "RAG Subsystem Production Evaluation Report",
        "timestamp_utc": datetime.now(timezone.utc).isoformat(),
        "embedding_model": "sentence-transformers/all-MiniLM-L6-v2",
        "vector_store_type": "PersistentVectorStore (Cosine Similarity)",
        "total_queries_evaluated": num_queries,
        "summary_counts": {
            "in_domain_total": in_domain_count,
            "in_domain_hits": hits_count,
            "in_domain_misses": misses_count,
            "out_of_domain_negative_controls": ood_count,
        },
        "aggregate_metrics": aggregate_metrics,
        "per_query_results": per_query_results,
    }

    report_path = ML_SERVICE_DIR / "reports" / "rag_eval_report.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)

    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(final_report, f, indent=2)

    logger.info(f"RAG Evaluation Completed! Report saved to {report_path}")
    print("\n=============================================================")
    print("RAG SUB-SYSTEM EVALUATION SUMMARY")
    print("=============================================================")
    print(f"Total Queries Evaluated: {num_queries}")
    print(f"In-Domain Hits: {hits_count} / {in_domain_count} | Misses: {misses_count} | OOD Controls: {ood_count}")
    print(f"In-Domain Recall@4:      {aggregate_metrics['in_domain_recall_at_4']}")
    print(f"In-Domain Precision@4:   {aggregate_metrics['in_domain_precision_at_4']}")
    print(f"In-Domain MRR:           {aggregate_metrics['in_domain_mrr']}")
    print(f"In-Domain Hit Rate:      {aggregate_metrics['in_domain_hit_rate']}")
    print(f"Mean Context Coverage:   {aggregate_metrics['mean_context_coverage']}")
    print(f"Citation-ID Validity:    {aggregate_metrics['mean_citation_id_validity']}")
    print(f"Mean Lexical Support:    {aggregate_metrics['mean_lexical_support']}")
    print(f"Abstention Correctness:  {aggregate_metrics['abstention_correctness']}")
    print("=============================================================\n")

if __name__ == "__main__":
    run_eval()
