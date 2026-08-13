"""
WealthGenie RAG Subsystem - Ingestion Trust Tiering Test Suite
Verifies that only documents from pre-approved trusted domains/sources are ingested.
Untrusted sources are rejected unless manual_override=True is specified.
"""

import pytest
from pathlib import Path
from rag.ingestion.pipeline import IngestionPipeline, UntrustedSourceError
from rag.embeddings.dense_embedding import DenseVectorEmbeddingProvider
from rag.vector_store.memory_vector_store import PersistentVectorStore


def test_untrusted_source_rejection(tmp_path):
    index_file = tmp_path / "test_trust_index.json"
    embedder = DenseVectorEmbeddingProvider(dimension=64, enable_cache=False)
    pipeline = IngestionPipeline(embedder=embedder, vector_store=PersistentVectorStore(index_path=index_file))

    # Attempt to ingest document from an untrusted blog source
    with pytest.raises(UntrustedSourceError) as exc_info:
        pipeline.ingest_text(
            text="Get rich quick scheme with guaranteed 50% returns in 30 days.",
            title="Random Investment Blog",
            source="http://random-crypto-blog.com/tips.html",
            source_trust_tier="unverified_web",
        )

    assert "Ingestion rejected" in str(exc_info.value)
    assert "random-crypto-blog.com" in str(exc_info.value)


def test_untrusted_source_manual_override(tmp_path):
    index_file = tmp_path / "test_trust_override_index.json"
    embedder = DenseVectorEmbeddingProvider(dimension=64, enable_cache=False)
    pipeline = IngestionPipeline(embedder=embedder, vector_store=PersistentVectorStore(index_path=index_file))

    # Manual override bypasses trust gate
    res = pipeline.ingest_text(
        text="Special manual audit document.",
        title="Audit Doc",
        source="http://internal-audit-server.local/doc.pdf",
        manual_override=True,
    )
    assert res["status"] == "success"
    assert res["chunks_created"] > 0


def test_trusted_government_domain_accepted(tmp_path):
    index_file = tmp_path / "test_trust_gov_index.json"
    embedder = DenseVectorEmbeddingProvider(dimension=64, enable_cache=False)
    pipeline = IngestionPipeline(embedder=embedder, vector_store=PersistentVectorStore(index_path=index_file))

    # Ingest from official SEBI domain
    res = pipeline.ingest_text(
        text="SEBI mutual fund categorization guidelines require 65% equity allocation for flexicap funds.",
        title="SEBI Mutual Fund Circular",
        source="https://www.sebi.gov.in/legal/circulars/feb-2026/categorization_99983.html",
        source_trust_tier="government_official",
    )
    assert res["status"] == "success"
    assert res["chunks_created"] > 0
