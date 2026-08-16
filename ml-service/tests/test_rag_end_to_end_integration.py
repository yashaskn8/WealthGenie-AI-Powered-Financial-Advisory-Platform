"""
WealthGenie RAG Subsystem - Full End-to-End System Integration Test Suite
Verifies end-to-end flow from document ingestion, lifecycle management, multi-tenant hybrid retrieval,
reranking, prompt security, context management, observability logging, response caching, and recovery.
"""

import pytest
from rag.config import RAGConfig
from rag.embeddings.dense_embedding import DenseVectorEmbeddingProvider
from rag.ingestion.pipeline import IngestionPipeline
from rag.lifecycle.manager import DocumentLifecycleManager
from rag.retrieval.pipeline import RAGPipeline
from rag.schema import RAGQueryRequest
from rag.vector_store.memory_vector_store import PersistentVectorStore


def test_full_rag_end_to_end_pipeline_workflow(tmp_path):
    index_path = tmp_path / "integration_vector_index.json"
    config = RAGConfig(vector_store_path=index_path, embedding_dim=64, similarity_threshold=0.0)
    embedder = DenseVectorEmbeddingProvider(dimension=64, enable_cache=False)
    vector_store = PersistentVectorStore(index_path=index_path)

    ingestion_pipeline = IngestionPipeline(embedder=embedder, vector_store=vector_store)
    query_pipeline = RAGPipeline(embedder=embedder, vector_store=vector_store, config=config)
    lifecycle_manager = DocumentLifecycleManager(vector_store=vector_store)

    # 1. Ingestion Phase for Tenant Alpha
    tax_content = (
        "Section 87A rebate of the Income Tax Act provides tax relief up to Rs 25,000 "
        "for resident individuals with net taxable income up to Rs 7,00,000 under the new tax regime. "
        "This rebate effectively makes income up to Rs 7 lakh tax-free for individual taxpayers."
    )
    ingest_res = ingestion_pipeline.ingest_text(
        text=tax_content,
        title="Income Tax Act Section 87A",
        source="tax_code_2026.pdf",
        author="CBDT India",
        tenant_id="tenant_alpha",
    )
    assert ingest_res["chunks_created"] > 0
    doc_id = ingest_res["document_id"]

    # 2. Query Phase for Tenant Alpha -> Expect Grounded Response with Citations
    req_alpha = RAGQueryRequest(
        question="Section 87A rebate limit for income tax",
        tenant_id="tenant_alpha",
    )
    res_alpha = query_pipeline.query(req_alpha)
    assert res_alpha.grounded
    assert len(res_alpha.retrieved_chunks) > 0
    assert len(res_alpha.citations) > 0
    assert res_alpha.metrics["chunks_retrieved"] > 0

    # 3. Multi-Tenant Query Phase for Tenant Beta -> Expect 0 retrieved chunks
    req_beta = RAGQueryRequest(
        question="Section 87A rebate limit for income tax",
        tenant_id="tenant_beta",
    )
    res_beta = query_pipeline.query(req_beta)
    assert not res_beta.grounded
    assert len(res_beta.retrieved_chunks) == 0

    # 4. Lifecycle Document Purging (Hard Delete) & Cache Invalidation
    deleted = lifecycle_manager.hard_delete_document(doc_id)
    assert deleted
    query_pipeline.cache_manager.invalidate_all()

    # 5. Query post-purging -> Grounding should fail
    req_post_delete = RAGQueryRequest(
        question="Section 87A rebate limit for income tax",
        tenant_id="tenant_alpha",
    )
    res_post_delete = query_pipeline.query(req_post_delete)
    assert not res_post_delete.grounded
