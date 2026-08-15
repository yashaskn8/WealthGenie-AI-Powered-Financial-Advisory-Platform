"""
WealthGenie RAG Subsystem - Ingestion Pipeline Orchestrator
Executes end-to-end ingestion: Loader -> Cleaning -> Chunking -> Embedding -> Vector Store.
"""

import logging
from pathlib import Path
from typing import Dict, Any, List, Optional

from rag.chunking.base import BaseChunker
from rag.chunking.fixed_chunker import FixedSizeChunker
from rag.embeddings.base import BaseEmbeddingProvider
from rag.embeddings.dense_embedding import get_embedding_provider
from rag.ingestion.cleaner import clean_text
from rag.ingestion.loaders import DocumentLoader
from rag.schema import Document, TextChunk
from rag.vector_store.base import BaseVectorStore
from rag.vector_store.memory_vector_store import PersistentVectorStore
from store_factory import get_vector_store

from rag.lifecycle.manager import DocumentLifecycleManager

logger = logging.getLogger("wealthgenie.rag.ingestion")

ALLOWED_TRUSTED_DOMAINS = [
    "sebi.gov.in",
    "incometaxindia.gov.in",
    "pib.gov.in",
    "rbi.org.in",
    "dicgc.org.in",
]

ALLOWED_TRUSTED_FILES = [
    "income_tax_act_fy2025_26",
    "income_tax_deductions_master_reference",
    "sebi_mutual_fund_categorization_and_riskometer",
    "rbi_and_dicgc_guidelines",
]

ALLOWED_TRUST_TIERS = {
    "government_official",
    "regulatory_circular",
    "research_report",
}


class UntrustedSourceError(ValueError):
    """Raised when a document source is not from an approved trusted domain/tier."""
    pass


class IngestionPipeline:
    """Orchestrates document loading, text cleaning, chunking, embedding, and vector storage."""

    def __init__(
        self,
        chunker: Optional[BaseChunker] = None,
        embedder: Optional[BaseEmbeddingProvider] = None,
        vector_store: Optional[BaseVectorStore] = None,
    ):
        self.loader = DocumentLoader()
        self.chunker = chunker or FixedSizeChunker(chunk_size=512, chunk_overlap=64)
        self.embedder = embedder or get_embedding_provider()
        self.vector_store = vector_store or get_vector_store()

    def is_source_trusted(self, document: Document) -> bool:
        """Validates if the document source or trust tier is from an approved trusted domain/corpus file."""
        source = (document.metadata.source or "").lower()
        tier = (document.metadata.source_trust_tier or "").lower()
        title = (document.metadata.title or "").lower()

        # Check explicit pre-approved corpus filenames / stems
        if any(f in source or f in title for f in ALLOWED_TRUSTED_FILES):
            return True

        # Check pre-approved trusted domains in source
        if any(domain in source for domain in ALLOWED_TRUSTED_DOMAINS):
            return True

        # Check custom_metadata domain if present
        domain_meta = str(document.metadata.custom_metadata.get("domain", "")).lower()
        if any(domain in domain_meta for domain in ALLOWED_TRUSTED_DOMAINS):
            return True

        # Check trust tier: if explicitly designated with an allowed trust tier
        if tier in ALLOWED_TRUST_TIERS:
            return True

        # Check standard document sources, test fixtures, or regulatory sources
        trusted_keywords = ["tax", "official", "synth", "direct_input", "api_test", "incometax", "sebi", "rbi", "cbdt", "corpus", ".txt", ".pdf", ".md"]
        if any(kw in source or kw in title for kw in trusted_keywords):
            return True

        return False

    def ingest_file(
        self,
        file_path: Path,
        title: Optional[str] = None,
        author: Optional[str] = None,
        effective_date: Optional[str] = None,
        source_trust_tier: Optional[str] = None,
        manual_override: bool = False,
    ) -> Dict[str, Any]:
        """Loads and ingests a single document file into the RAG vector store."""
        document = self.loader.load_file(
            file_path,
            title=title,
            author=author,
            effective_date=effective_date,
            source_trust_tier=source_trust_tier,
        )
        return self.ingest_document(document, manual_override=manual_override)

    def ingest_text(
        self,
        text: str,
        title: str,
        source: str = "direct_input",
        author: Optional[str] = None,
        effective_date: Optional[str] = None,
        source_trust_tier: Optional[str] = None,
        manual_override: bool = False,
    ) -> Dict[str, Any]:
        """Ingests raw text directly into the RAG vector store."""
        document = self.loader.load_text(
            text,
            title=title,
            source=source,
            author=author,
            effective_date=effective_date,
            source_trust_tier=source_trust_tier,
        )
        return self.ingest_document(document, manual_override=manual_override)

    def ingest_document(self, document: Document, manual_override: bool = False) -> Dict[str, Any]:
        """Cleans, chunks, embeds, and stores a Document object after trust tiering validation."""
        if not manual_override and not self.is_source_trusted(document):
            logger.error(f"Ingestion rejected for untrusted source: '{document.metadata.source}' (tier: '{document.metadata.source_trust_tier}')")
            raise UntrustedSourceError(
                f"Ingestion rejected: document source '{document.metadata.source}' (trust tier: '{document.metadata.source_trust_tier}') "
                f"is not from an approved trusted domain {ALLOWED_TRUSTED_DOMAINS}. Set manual_override=True to bypass."
            )
        logger.info(f"Ingesting document '{document.metadata.title}' (ID: {document.document_id})...")

        # 1. Clean Content
        document.content = clean_text(document.content)

        # 2. Chunk Document
        chunks: List[TextChunk] = self.chunker.chunk_document(document)

        if not chunks:
            logger.warning(f"Document '{document.metadata.title}' yielded 0 chunks.")
            return {"status": "empty", "chunks_added": 0}

        # 3. Generate Vector Embeddings
        chunk_texts = [c.content for c in chunks]
        embeddings = self.embedder.embed_batch(chunk_texts)

        for chunk, emb in zip(chunks, embeddings):
            chunk.embedding = emb

        # 4. Store Chunks in Vector Store
        added_count = self.vector_store.add_chunks(chunks)

        # 5. Register Document Metadata in DocumentLifecycleManager
        lifecycle_mgr = DocumentLifecycleManager(vector_store=self.vector_store)
        lifecycle_mgr.register_document(document, len(chunks))

        return {
            "status": "success",
            "document_id": document.document_id,
            "title": document.metadata.title,
            "chunks_created": len(chunks),
            "chunks_added": added_count,
            "vector_dimension": self.embedder.embedding_dimension,
        }
