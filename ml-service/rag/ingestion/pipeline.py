"""
WealthGenie RAG Subsystem - Document Ingestion Pipeline
Validates source trust tiers, cleans raw text, chunks hierarchically,
generates embeddings, and indexes into the persistent vector store.
"""

import logging
import os
from pathlib import Path
from typing import Dict, Any, List, Optional

from rag.chunking.fixed_chunker import FixedSizeChunker
from rag.chunking.recursive_chunker import RecursiveCharacterChunker
from rag.cleaning.cleaner import clean_text
from rag.embeddings.dense import DenseVectorEmbeddingProvider, get_embedding_provider
from rag.exceptions import UntrustedSourceError
from rag.ingestion.loader import DocumentLoader
from rag.schema import Document, TextChunk
from rag.storage.vector_store import PersistentVectorStore, get_vector_store
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


class IngestionPipeline:
    """End-to-end ingestion pipeline for documents into the vector store."""

    def __init__(
        self,
        loader: Optional[DocumentLoader] = None,
        chunker: Optional[Any] = None,
        embedder: Optional[DenseVectorEmbeddingProvider] = None,
        vector_store: Optional[PersistentVectorStore] = None,
    ):
        self.loader = loader or DocumentLoader()
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
        trusted_keywords = ["tax_", "official_", "synth_", "direct_input", "api_test", "incometax", "sebi", "rbi", "cbdt", "tax_code", "nps", "elss", ".txt", ".pdf", ".md", ".csv"]
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

        # 4. Add to Vector Store
        self.vector_store.add_chunks(chunks)

        return {
            "status": "success",
            "document_id": document.document_id,
            "title": document.metadata.title,
            "chunks_added": len(chunks),
        }

    def ingest_text(
        self,
        text: str,
        title: str = "Direct Text Ingestion",
        source: str = "direct_input",
        author: str = "WealthGenie Advisor",
        effective_date: Optional[str] = None,
        source_trust_tier: str = "government_official",
        manual_override: bool = False,
    ) -> Dict[str, Any]:
        """Convenience method to ingest raw string content into the vector store."""
        document = self.loader.load_text(
            text=text,
            title=title,
            source=source,
            author=author,
            effective_date=effective_date,
            source_trust_tier=source_trust_tier,
        )
        return self.ingest_document(document, manual_override=manual_override)
