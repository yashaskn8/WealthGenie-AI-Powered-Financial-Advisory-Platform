"""
WealthGenie RAG Subsystem - Persistent Vector Store Implementation
High-performance Cosine Similarity vector store with atomic writes, checksum verification, backup snapshots, and corruption recovery.
"""

import hashlib
import json
import logging
import os
import shutil
from pathlib import Path
from typing import Dict, List, Any
import numpy as np

from rag.config import RAGConfig
from rag.schema import TextChunk, RetrievedChunk, ChunkMetadata
from rag.vector_store.base import BaseVectorStore

logger = logging.getLogger("wealthgenie.rag.vector_store")


class PersistentVectorStore(BaseVectorStore):
    """Hardened vector database supporting Cosine Similarity search, atomic writes, and corruption recovery."""

    VERSION = "2.0"

    def __init__(self, index_path: Path = None):
        self.index_path = index_path or RAGConfig().vector_store_path
        self.backup_path = self.index_path.with_suffix(".json.bak")
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

    def search(
        self,
        query_vector: List[float],
        top_k: int = 4,
        threshold: float = 0.0,
        tenant_id: str = "default",
    ) -> List[RetrievedChunk]:
        """Executes tenant-isolated similarity search using Cosine Similarity."""
        if not self._chunks or not self._embeddings:
            return []

        # Filter indices by tenant_id scope
        valid_indices = [
            i for i, c in enumerate(self._chunks)
            if getattr(c, "tenant_id", "default") == tenant_id
            or getattr(c.metadata, "tenant_id", "default") == tenant_id
        ]
        if not valid_indices:
            return []

        q_vec = np.array(query_vector, dtype=np.float32)
        q_norm = np.linalg.norm(q_vec)
        if q_norm == 0:
            return []
        q_vec = q_vec / q_norm

        sub_embeddings = [self._embeddings[i] for i in valid_indices]
        matrix = np.array(sub_embeddings, dtype=np.float32)
        norms = np.linalg.norm(matrix, axis=1, keepdims=True)
        norms[norms == 0] = 1.0
        matrix_normed = matrix / norms

        # Cosine Similarity dot product
        similarities = np.dot(matrix_normed, q_vec)

        # Rank indices by descending similarity score
        top_sub_indices = np.argsort(similarities)[::-1][:top_k]

        results: List[RetrievedChunk] = []
        for rank, sub_idx in enumerate(top_sub_indices, start=1):
            score = float(similarities[sub_idx])
            if score >= threshold:
                original_idx = valid_indices[sub_idx]
                results.append(
                    RetrievedChunk(
                        chunk=self._chunks[original_idx],
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
            "version": self.VERSION,
            "total_chunks": len(self._chunks),
            "unique_documents": unique_docs,
            "embedding_dimension": dimension,
            "index_path": str(self.index_path),
            "backup_exists": self.backup_path.exists(),
        }

    def save(self) -> None:
        """
        Persists chunks and vector embeddings to disk using atomic write and backup snapshot creation.
        """
        self.index_path.parent.mkdir(parents=True, exist_ok=True)

        serialized_chunks = [chunk.model_dump() for chunk in self._chunks]
        payload_str = json.dumps(serialized_chunks)
        checksum = hashlib.sha256(payload_str.encode("utf-8")).hexdigest()

        wrapped_index = {
            "version": self.VERSION,
            "sha256": checksum,
            "total_chunks": len(serialized_chunks),
            "chunks": serialized_chunks,
        }

        # 1. Atomic Write to Temporary File
        tmp_path = self.index_path.with_suffix(".tmp")
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(wrapped_index, f, indent=2)

        # 2. Backup Snapshot Creation
        if self.index_path.exists():
            try:
                shutil.copy2(self.index_path, self.backup_path)
            except Exception as e:
                logger.warning(f"Could not create backup snapshot: {e}")

        # 3. Replace Atomic Move
        os.replace(tmp_path, self.index_path)
        logger.info(f"Safely persisted vector index (v{self.VERSION}, checksum: {checksum[:8]}) to {self.index_path}")

    def load(self) -> None:
        """Loads index from disk with corruption detection and backup recovery."""
        if not self.index_path.exists():
            return

        try:
            self._load_from_path(self.index_path)
        except Exception as e:
            logger.error(f"Failed to load primary vector index from {self.index_path}: {e}")
            if self.backup_path.exists():
                logger.warning(f"Attempting corruption recovery from backup: {self.backup_path}")
                try:
                    self._load_from_path(self.backup_path)
                    logger.info("Successfully recovered vector store index from backup!")
                except Exception as backup_err:
                    logger.error(f"Backup recovery also failed: {backup_err}")
            else:
                logger.error("No backup snapshot available for recovery.")

    def _load_from_path(self, file_path: Path) -> None:
        """Helper to parse and validate index file format (v1.0 list vs v2.0 wrapped dict)."""
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        if isinstance(data, dict) and "chunks" in data:
            # Format v2.0
            chunks_list = data["chunks"]
            expected_hash = data.get("sha256")
            if expected_hash:
                actual_hash = hashlib.sha256(json.dumps(chunks_list).encode("utf-8")).hexdigest()
                if actual_hash != expected_hash:
                    raise ValueError(f"Vector index checksum mismatch! Expected {expected_hash[:8]}, got {actual_hash[:8]}")
        elif isinstance(data, list):
            # Format v1.0 (backward compatibility)
            chunks_list = data
        else:
            raise ValueError("Invalid vector index structure.")

        self._chunks = [TextChunk(**item) for item in chunks_list]
        self._embeddings = [c.embedding for c in self._chunks if c.embedding]
        logger.info(f"Loaded {len(self._chunks)} chunks into PersistentVectorStore from {file_path}")
