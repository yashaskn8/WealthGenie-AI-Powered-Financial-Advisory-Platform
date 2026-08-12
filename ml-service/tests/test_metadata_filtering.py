"""
Unit tests for document metadata schema, effective_date, source_trust_tier, and metadata filtering.
"""

import tempfile
from pathlib import Path
import pytest

from rag.ingestion.pipeline import IngestionPipeline
from rag.schema import DocumentMetadata, Document
from rag.vector_store.memory_vector_store import PersistentVectorStore


def test_document_metadata_schema_recency_fields():
    """Verifies DocumentMetadata schema handles effective_date and source_trust_tier."""
    meta = DocumentMetadata(
        title="Income Tax Circular",
        source="incometax.gov.in",
        author="CBDT",
        effective_date="2025-04-01",
        source_trust_tier="government_official",
    )
    assert meta.effective_date == "2025-04-01"
    assert meta.source_trust_tier == "government_official"


def test_ingestion_preserves_metadata_fields():
    """Verifies IngestionPipeline retains effective_date and source_trust_tier on text chunks."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        index_file = Path(tmp_dir) / "test_meta_index.json"
        store = PersistentVectorStore(index_path=index_file, force_numpy=True)
        pipeline = IngestionPipeline(vector_store=store)

        pipeline.ingest_text(
            text="Section 80C allows tax deduction up to Rs 1,50,000 per financial year.",
            title="Tax Law 2025",
            source="tax_2025.txt",
            author="Income Tax Department",
            effective_date="2025-04-01",
            source_trust_tier="government_official",
        )

        assert len(store._chunks) > 0
        first_chunk = store._chunks[0]
        assert first_chunk.metadata.effective_date == "2025-04-01"
        assert first_chunk.metadata.source_trust_tier == "government_official"


def test_metadata_filtering_by_trust_tier():
    """Verifies filtering chunks by source_trust_tier metadata property."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        index_file = Path(tmp_dir) / "test_filter_index.json"
        store = PersistentVectorStore(index_path=index_file, force_numpy=True)
        pipeline = IngestionPipeline(vector_store=store)

        pipeline.ingest_text(
            text="Official CBDT Circular on Section 87A tax rebate threshold.",
            title="Official Circular",
            source="official_cbdt.txt",
            effective_date="2025-04-01",
            source_trust_tier="government_official",
        )

        pipeline.ingest_text(
            text="Third-party blog discussion on potential tax savings.",
            title="Blog Post",
            source="blog.txt",
            effective_date="2024-01-01",
            source_trust_tier="internal_analysis",
        )

        gov_chunks = [c for c in store._chunks if c.metadata.source_trust_tier == "government_official"]
        blog_chunks = [c for c in store._chunks if c.metadata.source_trust_tier == "internal_analysis"]

        assert len(gov_chunks) >= 1
        assert len(blog_chunks) >= 1
        assert all(c.metadata.source_trust_tier == "government_official" for c in gov_chunks)
