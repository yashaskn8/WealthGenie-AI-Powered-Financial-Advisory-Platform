"""
WealthGenie RAG Subsystem - Comprehensive Test Suite
Tests document loading, text cleaning, chunking, embeddings, vector search, retrieval pipeline, citations, and FastAPI RAG endpoints.
"""

import pytest
import numpy as np
from pathlib import Path
from fastapi.testclient import TestClient

from rag.config import RAGConfig
from rag.schema import Document, DocumentMetadata, RAGQueryRequest
from rag.ingestion.loaders import DocumentLoader
from rag.ingestion.cleaner import clean_text
from rag.chunking.fixed_chunker import FixedSizeChunker
from rag.chunking.recursive_chunker import RecursiveCharacterChunker
from rag.embeddings.dense_embedding import DenseVectorEmbeddingProvider
from rag.embeddings.cache import EmbeddingCache
from rag.vector_store.memory_vector_store import PersistentVectorStore
from rag.ingestion.pipeline import IngestionPipeline
from rag.retrieval.pipeline import RAGPipeline
from rag.prompts.builder import PromptBuilder
from rag.citations.engine import CitationEngine
from main import app

client = TestClient(app)


def test_document_loader():
    loader = DocumentLoader()
    doc = loader.load_text("Tax income slab is 5% for 4L to 8L.", title="Tax Rules", author="Finance Ministry")
    assert doc.document_id is not None
    assert doc.metadata.title == "Tax Rules"
    assert doc.metadata.author == "Finance Ministry"


def test_text_cleaner():
    raw = "  Tax  Rules\n\n\n\nSection 80C   deduction.\r\n "
    cleaned = clean_text(raw)
    assert "Tax Rules" in cleaned
    assert "\n\n\n" not in cleaned
    assert cleaned.startswith("Tax Rules")


def test_chunking_strategies():
    loader = DocumentLoader()
    doc = loader.load_text("Word " * 200, title="Long Document")

    fixed_chunker = FixedSizeChunker(chunk_size=100, chunk_overlap=20)
    fixed_chunks = fixed_chunker.chunk_document(doc)
    assert len(fixed_chunks) > 1
    assert fixed_chunks[0].metadata.document_id == doc.document_id

    recursive_chunker = RecursiveCharacterChunker(chunk_size=100, chunk_overlap=20)
    rec_chunks = recursive_chunker.chunk_document(doc)
    assert len(rec_chunks) > 1


def test_embedding_provider_and_cache(tmp_path):
    cache_file = tmp_path / "test_cache.json"
    cache = EmbeddingCache(cache_path=cache_file)

    embedder = DenseVectorEmbeddingProvider(dimension=64, enable_cache=True)
    embedder.cache = cache

    vec1 = embedder.embed_text("Income Tax FY 2025-26 New Regime")
    assert len(vec1) == 64
    assert np.isclose(np.linalg.norm(vec1), 1.0, atol=1e-3)

    # Test cache hit
    vec2 = embedder.embed_text("Income Tax FY 2025-26 New Regime")
    assert vec1 == vec2
    assert cache.hits == 1


def test_vector_store_search(tmp_path):
    index_file = tmp_path / "test_vector_index.json"
    store = PersistentVectorStore(index_path=index_file)

    loader = DocumentLoader()
    doc = loader.load_text("Section 80C covers ELSS mutual funds and PPF up to 1.5 Lakhs.", title="80C Rules")
    chunker = FixedSizeChunker(chunk_size=200, chunk_overlap=0)
    chunks = chunker.chunk_document(doc)

    embedder = DenseVectorEmbeddingProvider(dimension=64, enable_cache=False)
    for c in chunks:
        c.embedding = embedder.embed_text(c.content)

    store.add_chunks(chunks)
    assert store.get_stats()["total_chunks"] > 0

    query_vec = embedder.embed_text("ELSS mutual fund 80C deduction")
    results = store.search(query_vec, top_k=2)
    assert len(results) > 0
    assert results[0].chunk.metadata.title == "80C Rules"


def test_ingestion_and_rag_pipeline(tmp_path):
    index_file = tmp_path / "rag_pipeline_index.json"
    embedder = DenseVectorEmbeddingProvider(dimension=64, enable_cache=False)
    pipeline = IngestionPipeline(embedder=embedder, vector_store=PersistentVectorStore(index_path=index_file))
    res = pipeline.ingest_text(
        text="Under FY 2025-26 New Tax Regime, income up to 12 Lakhs incurs zero tax due to Section 87A rebate.",
        title="Tax Rebates 2025",
        author="CBDT",
    )
    assert res["status"] == "success"

    query_pipe = RAGPipeline(embedder=embedder, vector_store=pipeline.vector_store)
    req = RAGQueryRequest(question="What is the rebate limit under Section 87A for FY 2025-26?")
    response = query_pipe.query(req)

    assert response.grounded
    assert len(response.retrieved_chunks) > 0
    assert len(response.citations) > 0
    assert "Tax Rebates 2025" in response.citations[0].document_title


def test_fastapi_rag_endpoints():
    # 1. Health Probe
    res_health = client.get("/rag/health")
    assert res_health.status_code == 200
    assert res_health.json()["status"] == "ok"

    # 2. Status Probe
    res_status = client.get("/rag/status")
    assert res_status.status_code == 200
    assert "vector_store_stats" in res_status.json()

    # 3. Index Endpoint
    res_index = client.post(
        "/rag/index",
        json={
            "title": "NPS Tax Relief",
            "content": "Section 80CCD(1B) provides an additional tax deduction of Rs 50,000 for National Pension System.",
            "source": "api_test",
        },
    )
    assert res_index.status_code == 200

    # 4. Query Endpoint
    res_query = client.post(
        "/rag/query",
        json={"question": "How much additional tax deduction is allowed for NPS under 80CCD?"},
    )
    assert res_query.status_code == 200
    data = res_query.json()
    assert "answer" in data
    assert "citations" in data
