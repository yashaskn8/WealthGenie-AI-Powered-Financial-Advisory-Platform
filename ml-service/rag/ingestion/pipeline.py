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
from rag.embeddings.dense_embedding import DenseVectorEmbeddingProvider
from rag.ingestion.cleaner import clean_text
from rag.ingestion.loaders import DocumentLoader
from rag.schema import Document, TextChunk
from rag.vector_store.base import BaseVectorStore
from rag.vector_store.memory_vector_store import PersistentVectorStore

logger = logging.getLogger("wealthgenie.rag.ingestion")


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
        self.embedder = embedder or DenseVectorEmbeddingProvider(dimension=128)
        self.vector_store = vector_store or PersistentVectorStore()

    def ingest_file(self, file_path: Path, title: Optional[str] = None, author: Optional[str] = None) -> Dict[str, Any]:
        """Loads and ingests a single document file into the RAG vector store."""
        document = self.loader.load_file(file_path, title=title, author=author)
        return self.ingest_document(document)

    def ingest_text(self, text: str, title: str, source: str = "direct_input", author: Optional[str] = None) -> Dict[str, Any]:
        """Ingests raw text directly into the RAG vector store."""
        document = self.loader.load_text(text, title=title, source=source, author=author)
        return self.ingest_document(document)

    def ingest_document(self, document: Document) -> Dict[str, Any]:
        """Cleans, chunks, embeds, and stores a Document object."""
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

        return {
            "status": "success",
            "document_id": document.document_id,
            "title": document.metadata.title,
            "chunks_created": len(chunks),
            "chunks_added": added_count,
            "vector_dimension": self.embedder.embedding_dimension,
        }
