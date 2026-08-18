"""
WealthGenie RAG Subsystem - Document Lifecycle Manager
Manages document version history, soft/hard deletion, incremental re-indexing, duplicate detection, and metadata updates.
Hardened with atomic writes, SHA-256 checksum validation, backup recovery, reconciliation, and thread-safe synchronization.
"""

import hashlib
import json
import logging
import os
import shutil
import threading
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

    VERSION = "2.0"

    def __init__(
        self,
        vector_store: Optional[BaseVectorStore] = None,
        registry_path: Path = REGISTRY_PATH,
    ):
        self.vector_store = vector_store or PersistentVectorStore()
        self.registry_path = Path(registry_path)
        self.backup_path = self.registry_path.with_suffix(".json.bak")
        self._lock = threading.Lock()
        self._registry: Dict[str, Dict[str, Any]] = {}
        self.load_registry()
        self.reconcile_registry_and_vector_store()

    def register_document(self, document: Document, chunk_count: int) -> None:
        """Registers or updates document entry in the document registry."""
        with self._lock:
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
            self._save_registry_unlocked()
            logger.info(f"Registered document '{document.metadata.title}' (v{version}) in DocumentRegistry.")

    def soft_delete_document(self, document_id: str) -> bool:
        """Soft deletes document by marking it inactive in registry."""
        with self._lock:
            if document_id not in self._registry:
                return False
            self._registry[document_id]["is_active"] = False
            self._registry[document_id]["updated_at_utc"] = datetime.now(timezone.utc).isoformat()
            self._save_registry_unlocked()
            logger.info(f"Soft-deleted document '{document_id}' in DocumentRegistry.")
            return True

    def hard_delete_document(self, document_id: str) -> bool:
        """
        Hard deletes document from vector store chunks FIRST, then from registry SECOND.
        
        ORDERING JUSTIFICATION:
        In a financial advisory RAG system, having content indexed in the vector store without
        a registry entry allows outdated, inaccurate, or legally revoked advice to be retrieved
        and cited by the LLM (compliance/security violation). Conversely, if content is purged
        from the vector store first, a crash before registry deletion leaves a harmless stale
        metadata entry (search fails safely with 0 results and is flagged by reconciliation).
        Thus, vector store purging MUST always precede registry deletion.
        """
        with self._lock:
            found_in_registry = document_id in self._registry

            # 1. Purge chunks and embeddings from vector store FIRST
            chunks: List[TextChunk] = getattr(self.vector_store, "_chunks", [])
            embeddings: List[List[float]] = getattr(self.vector_store, "_embeddings", [])

            initial_count = len(chunks)
            filtered_chunks = []
            filtered_embeddings = []

            for c, emb in zip(chunks, embeddings):
                if c.document_id != document_id:
                    filtered_chunks.append(c)
                    filtered_embeddings.append(emb)

            purged_chunks_count = initial_count - len(filtered_chunks)
            if purged_chunks_count > 0:
                setattr(self.vector_store, "_chunks", filtered_chunks)
                setattr(self.vector_store, "_embeddings", filtered_embeddings)
                setattr(self.vector_store, "_faiss_dirty", True)
                self.vector_store.save()
                logger.info(
                    f"Hard-deleted {purged_chunks_count} chunks for document '{document_id}' from PersistentVectorStore."
                )

            # 2. Remove document record from registry SECOND
            if found_in_registry:
                del self._registry[document_id]
                self._save_registry_unlocked()
                logger.info(f"Removed document '{document_id}' from DocumentRegistry.")

            return found_in_registry or (purged_chunks_count > 0)

    def update_metadata(
        self,
        document_id: str,
        new_title: Optional[str] = None,
        new_author: Optional[str] = None,
    ) -> bool:
        """
        Updates metadata in vector store chunks FIRST, then in document registry SECOND.
        
        ORDERING JUSTIFICATION:
        Vector store chunks provide the citation titles and authors directly returned to users
        and fed to the LLM during RAG generation. Updating and persisting vector chunks first
        guarantees that active queries immediately reflect accurate attribution. If a crash
        occurs before the registry save, retrieval citations remain correct while registry
        reconciliation flags the drift.
        """
        with self._lock:
            found_in_reg = document_id in self._registry
            found_in_store = any(
                c.document_id == document_id for c in getattr(self.vector_store, "_chunks", [])
            )
            if not found_in_reg and not found_in_store:
                return False

            # 1. Update metadata in vector store chunks FIRST
            chunks: List[TextChunk] = getattr(self.vector_store, "_chunks", [])
            chunks_modified = False
            for c in chunks:
                if c.document_id == document_id:
                    if new_title:
                        c.metadata.title = new_title
                        chunks_modified = True
                    if new_author:
                        c.metadata.author = new_author
                        chunks_modified = True

            if chunks_modified:
                self.vector_store.save()
                logger.info(f"Updated chunk metadata for document '{document_id}' in vector store.")

            # 2. Update registry metadata SECOND
            if found_in_reg:
                if new_title:
                    self._registry[document_id]["title"] = new_title
                if new_author:
                    self._registry[document_id]["author"] = new_author
                self._registry[document_id]["updated_at_utc"] = datetime.now(timezone.utc).isoformat()
                self._save_registry_unlocked()
                logger.info(f"Updated metadata for document '{document_id}' in DocumentRegistry.")

            return True

    def list_documents(self, include_inactive: bool = False) -> List[Dict[str, Any]]:
        """Returns list of registered documents."""
        with self._lock:
            docs = list(self._registry.values())
            if not include_inactive:
                docs = [d for d in docs if d.get("is_active", True)]
            return docs

    def save_registry(self) -> None:
        """Persists registry to JSON file atomically with SHA256 checksum and backup snapshot."""
        with self._lock:
            self._save_registry_unlocked()

    def _save_registry_unlocked(self) -> None:
        """Internal helper for saving registry while lock is already held."""
        self.registry_path.parent.mkdir(parents=True, exist_ok=True)

        payload_str = json.dumps(self._registry, sort_keys=True)
        checksum = hashlib.sha256(payload_str.encode("utf-8")).hexdigest()

        wrapped_registry = {
            "version": self.VERSION,
            "sha256": checksum,
            "total_documents": len(self._registry),
            "documents": self._registry,
        }

        # 1. Atomic Write to Temporary File
        tmp_path = self.registry_path.with_suffix(".tmp")
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(wrapped_registry, f, indent=2)

        # 2. Backup Snapshot Creation
        if self.registry_path.exists():
            try:
                shutil.copy2(self.registry_path, self.backup_path)
            except Exception as e:
                logger.warning(f"Could not create registry backup snapshot: {e}")

        # 3. Replace Atomic Move
        os.replace(tmp_path, self.registry_path)
        logger.info(
            f"Safely persisted document registry (v{self.VERSION}, checksum: {checksum[:8]}) to {self.registry_path}"
        )

    def load_registry(self) -> None:
        """Loads registry from JSON file with checksum verification and backup snapshot recovery."""
        with self._lock:
            if not self.registry_path.exists() and not self.backup_path.exists():
                self._registry = {}
                return

            try:
                if self.registry_path.exists():
                    self._load_from_path(self.registry_path)
                    logger.info(
                        f"Loaded {len(self._registry)} document records into DocumentLifecycleManager from {self.registry_path}"
                    )
                    return
                else:
                    raise FileNotFoundError(f"Primary registry file missing: {self.registry_path}")
            except Exception as e:
                logger.error(f"Failed to load primary document registry from {self.registry_path}: {e}")
                if self.backup_path.exists():
                    logger.warning(f"Attempting registry corruption recovery from backup: {self.backup_path}")
                    try:
                        self._load_from_path(self.backup_path)
                        logger.info(
                            f"Successfully recovered {len(self._registry)} document records from backup snapshot: {self.backup_path}"
                        )
                        # Restore primary file from valid backup
                        try:
                            self._save_registry_unlocked()
                        except Exception as restore_err:
                            logger.warning(f"Could not restore primary registry from backup: {restore_err}")
                        return
                    except Exception as backup_err:
                        logger.critical(
                            f"Fatal: Document registry backup recovery also failed: {backup_err}"
                        )
                        raise RuntimeError(
                            f"Corrupted document registry and backup recovery failed: primary_err={e}, backup_err={backup_err}"
                        ) from e
                else:
                    logger.critical(
                        f"Fatal: No backup snapshot available for document registry recovery: {e}"
                    )
                    raise RuntimeError(
                        f"Corrupted document registry and no backup available: {e}"
                    ) from e

    def _load_from_path(self, file_path: Path) -> None:
        """Helper to parse and validate registry file format (v1.0 raw dict vs v2.0 wrapped dict)."""
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        if isinstance(data, dict) and "documents" in data:
            # Format v2.0
            docs = data["documents"]
            if not isinstance(docs, dict):
                raise ValueError("Registry 'documents' field must be a dictionary.")
            expected_hash = data.get("sha256")
            if expected_hash:
                actual_hash = hashlib.sha256(json.dumps(docs, sort_keys=True).encode("utf-8")).hexdigest()
                if actual_hash != expected_hash:
                    raise ValueError(
                        f"Document registry checksum mismatch! Expected {expected_hash[:8]}, got {actual_hash[:8]}"
                    )
            self._registry = docs
        elif isinstance(data, dict):
            # Format v1.0 (backward compatibility for raw dict of document_id -> metadata)
            self._registry = data
        else:
            raise ValueError(f"Invalid document registry structure in {file_path}")

    def reconcile_registry_and_vector_store(self) -> Dict[str, Any]:
        """
        Reconciles registry documents with vector store chunks to detect orphan chunks and stale registry entries.
        Reports anomalies at WARNING level with counts and IDs.
        """
        with self._lock:
            registry_doc_ids: Set[str] = set(self._registry.keys())
            chunks: List[TextChunk] = getattr(self.vector_store, "_chunks", [])
            vector_doc_ids: Set[str] = {c.document_id for c in chunks if c.document_id}

            # 1. Stale registry entries: document in registry but 0 chunks in vector store
            # (can happen if hard_delete crashed after purging vector store, or doc registered with 0 chunks)
            stale_registry_docs = sorted(list(registry_doc_ids - vector_doc_ids))

            # 2. Orphaned vector chunks: chunks exist in vector store but document_id not in registry
            # (can happen if ingestion failed before registering doc, or doc was delisted without vector purge in legacy code)
            orphaned_vector_docs = sorted(list(vector_doc_ids - registry_doc_ids))

            reconciliation_result = {
                "status": "CLEAN" if not stale_registry_docs and not orphaned_vector_docs else "ANOMALIES_DETECTED",
                "registry_document_count": len(registry_doc_ids),
                "vector_unique_document_count": len(vector_doc_ids),
                "total_chunks": len(chunks),
                "stale_registry_documents": stale_registry_docs,
                "stale_registry_count": len(stale_registry_docs),
                "orphaned_vector_documents": orphaned_vector_docs,
                "orphaned_vector_count": len(orphaned_vector_docs),
            }

            if stale_registry_docs:
                logger.warning(
                    f"[Reconciliation] Detected {len(stale_registry_docs)} stale registry entries with no index chunks: {stale_registry_docs}"
                )
            if orphaned_vector_docs:
                logger.warning(
                    f"[Reconciliation] Detected {len(orphaned_vector_docs)} orphaned document IDs in vector store without registry entries: {orphaned_vector_docs}"
                )

            return reconciliation_result
