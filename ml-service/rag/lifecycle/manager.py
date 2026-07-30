"""
WealthGenie RAG Subsystem - Document Lifecycle Manager
Manages document version history, soft/hard deletion, incremental re-indexing, duplicate detection, and metadata updates.
"""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Any, List, Optional, Set

from model.config import BASE_DIR
from rag.config import RAGConfig
from rag.schema import Document, DocumentMetadata, TextChunk
from rag.vector_store.base import BaseVectorStore
from rag.vector_store.memory_vector_store import PersistentVectorStore

REGISTRY_PATH = RAGConfig().document_registry_path
logger = logging.getLogger("wealthgenie.rag.lifecycle")


class DocumentLifecycleManager:
    """Manages document CRUD operations, version history, soft/hard deletion, and re-indexing."""

    def __init__(
        self,
        vector_store: Optional[BaseVectorStore] = None,
        registry_path: Path = REGISTRY_PATH,
    ):
        self.vector_store = vector_store or PersistentVectorStore()
        self.registry_path = registry_path
        self._registry: Dict[str, Dict[str, Any]] = {}
        self.load_registry()

    def register_document(self, document: Document, chunk_count: int) -> None:
        """Registers or updates document entry in the document registry."""
        doc_id = document.document_id
        is_existing = doc_id in self._registry

        version = int(self._registry[doc_id].get("version_number", 1)) + 1 if is_existing else 1

        self._registry[doc_id] = {
            "document_id": doc_id,
            "title": document.metadata.title,
            "source": document.metadata.source,
            "document_type": document.metadata.document_type,
            "author": document.metadata.author,
            "chunk_count": chunk_count,
            "is_active": True,
            "version_number": version,
            "created_at_utc": self._registry[doc_id].get("created_at_utc") if is_existing else datetime.now(timezone.utc).isoformat(),
            "updated_at_utc": datetime.now(timezone.utc).isoformat(),
        }
        self.save_registry()
        logger.info(f"Registered document '{document.metadata.title}' (v{version}) in DocumentRegistry.")

    def soft_delete_document(self, document_id: str) -> bool:
        """Soft deletes document by marking it inactive in registry."""
        if document_id not in self._registry:
            return False
        self._registry[document_id]["is_active"] = False
        self._registry[document_id]["updated_at_utc"] = datetime.now(timezone.utc).isoformat()
        self.save_registry()
        logger.info(f"Soft-deleted document '{document_id}' in DocumentRegistry.")
        return True

    def hard_delete_document(self, document_id: str) -> bool:
        """Hard deletes document from registry and purges all associated chunks from vector store."""
        found_in_registry = document_id in self._registry
        if found_in_registry:
            del self._registry[document_id]
            self.save_registry()

        # Remove chunks from vector store
        chunks: List[TextChunk] = getattr(self.vector_store, "_chunks", [])
        embeddings: List[List[float]] = getattr(self.vector_store, "_embeddings", [])

        initial_count = len(chunks)
        filtered_chunks = []
        filtered_embeddings = []

        for c, emb in zip(chunks, embeddings):
            if c.document_id != document_id:
                filtered_chunks.append(c)
                filtered_embeddings.append(emb)

        if len(filtered_chunks) < initial_count:
            setattr(self.vector_store, "_chunks", filtered_chunks)
            setattr(self.vector_store, "_embeddings", filtered_embeddings)
            self.vector_store.save()
            logger.info(f"Hard-deleted {initial_count - len(filtered_chunks)} chunks for document '{document_id}' from PersistentVectorStore.")
            return True

        return found_in_registry

    def update_metadata(self, document_id: str, new_title: Optional[str] = None, new_author: Optional[str] = None) -> bool:
        """Updates metadata across document registry and all associated vector store chunks."""
        if document_id not in self._registry:
            return False

        if new_title:
            self._registry[document_id]["title"] = new_title
        if new_author:
            self._registry[document_id]["author"] = new_author

        self._registry[document_id]["updated_at_utc"] = datetime.now(timezone.utc).isoformat()
        self.save_registry()

        # Update metadata in vector store chunks
        chunks: List[TextChunk] = getattr(self.vector_store, "_chunks", [])
        for c in chunks:
            if c.document_id == document_id:
                if new_title:
                    c.metadata.title = new_title
                if new_author:
                    c.metadata.author = new_author

        self.vector_store.save()
        logger.info(f"Updated metadata for document '{document_id}' in registry and vector store.")
        return True

    def list_documents(self, include_inactive: bool = False) -> List[Dict[str, Any]]:
        """Returns list of registered documents."""
        docs = list(self._registry.values())
        if not include_inactive:
            docs = [d for d in docs if d.get("is_active", True)]
        return docs

    def save_registry(self) -> None:
        """Persists registry to JSON file."""
        self.registry_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.registry_path, "w", encoding="utf-8") as f:
            json.dump(self._registry, f, indent=2)

    def load_registry(self) -> None:
        """Loads registry from JSON file."""
        if not self.registry_path.exists():
            return
        try:
            with open(self.registry_path, "r", encoding="utf-8") as f:
                self._registry = json.load(f)
            logger.info(f"Loaded {len(self._registry)} document records into DocumentLifecycleManager.")
        except Exception as e:
            logger.warning(f"Could not load document registry: {e}")
