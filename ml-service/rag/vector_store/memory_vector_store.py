"""
WealthGenie RAG Subsystem - Persistent Vector Store Implementation
High-performance Cosine Similarity vector store with document indexing and disk persistence.
"""

import json
import logging
from pathlib import Path
from typing import Dict, List, Any
import numpy as np

from rag.config import RAGConfig
from rag.schema import TextChunk, RetrievedChunk, ChunkMetadata
from rag.vector_store.base import BaseVectorStore

logger = logging.getLogger("wealthgenie.rag.vector_store")


class PersistentVectorStore(BaseVectorStore):
    """Vector database implementation supporting fast Cosine Similarity vector search."""

    def __init__(self, index_path: Path = None):
        self.index_path = index_path or RAGConfig().vector_store_path
        self._chunks: List[TextChunk] = []
        self._embeddings: List[List[float]] = []
        self.load()

    def add_chunks(self, chunks: List[TextChunk]) -> int:
        """Adds embedded text chunks to store, avoiding duplicate chunk_ids."""
        existing_ids = {c.chunk_id for c in self._chunks}
        added_count = 0

        for chunk in chunks:
            if not chunk.embedding:
                continue
            if chunk.chunk_id in existing_ids:
                # Update existing chunk
                idx = [i for i, c in enumerate(self._chunks) if c.chunk_id == chunk.chunk_id][0]
                self._chunks[idx] = chunk
                self._embeddings[idx] = chunk.embedding
            else:
                self._chunks.append(chunk)
                self._embeddings.append(chunk.embedding)
                existing_ids.add(chunk.chunk_id)
                added_count += 1

        self.save()
        logger.info(f"Added {added_count} new chunks to PersistentVectorStore. Total: {len(self._chunks)}")
        return added_count

    def search(self, query_vector: List[float], top_k: int = 4, threshold: float = 0.0) -> List[RetrievedChunk]:
        """Executes similarity search using Cosine Similarity."""
        if not self._chunks or not self._embeddings:
            return []

        q_vec = np.array(query_vector, dtype=np.float32)
        q_norm = np.linalg.norm(q_vec)
        if q_norm == 0:
            return []
        q_vec = q_vec / q_norm

        matrix = np.array(self._embeddings, dtype=np.float32)
        norms = np.linalg.norm(matrix, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        matrix_normed = matrix / norms

        # Cosine Similarity dot product
        similarities = np.dot(matrix_normed, q_vec)

        # Rank indices by descending similarity score
        top_indices = np.argsort(similarities)[::-1][:top_k]

        results: List[RetrievedChunk] = []
        for rank, idx in enumerate(top_indices, start=1):
            score = float(similarities[idx])
            if score >= threshold:
                results.append(
                    RetrievedChunk(
                        chunk=self._chunks[idx],
                        score=round(score, 4),
                        rank=rank,
                    )
                )

        return results

    def get_stats(self) -> Dict[str, Any]:
        """Returns metadata stats for the vector store."""
        unique_docs = len({c.document_id for c in self._chunks})
        dimension = len(self._embeddings[0]) if self._embeddings else 0
        return {
            "total_chunks": len(self._chunks),
            "unique_documents": unique_docs,
            "embedding_dimension": dimension,
            "index_path": str(self.index_path),
        }

    def save(self) -> None:
        """Persists chunks and vector embeddings to JSON index on disk."""
        self.index_path.parent.mkdir(parents=True, exist_ok=True)
        serialized = [chunk.model_dump() for chunk in self._chunks]
        with open(self.index_path, "w", encoding="utf-8") as f:
            json.dump(serialized, f, indent=2)

    def load(self) -> None:
        """Loads index from disk if file exists."""
        if not self.index_path.exists():
            return
        try:
            with open(self.index_path, "r", encoding="utf-8") as f:
                serialized = json.load(f)
            self._chunks = [TextChunk(**item) for item in serialized]
            self._embeddings = [c.embedding for c in self._chunks if c.embedding]
            logger.info(f"Loaded {len(self._chunks)} chunks into PersistentVectorStore from {self.index_path}")
        except Exception as e:
            logger.warning(f"Failed to load vector store from {self.index_path}: {e}")
