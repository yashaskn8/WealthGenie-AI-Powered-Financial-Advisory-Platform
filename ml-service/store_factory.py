"""
WealthGenie RAG/ML State - Store Factory

Creates MongoDB-backed or local-disk stores depending on the MONGODB_URI
environment variable. This centralizes the store selection logic so that
IngestionPipeline, RAGPipeline, router, and seed_knowledge all use the
same backend without each needing their own conditional import.

When MONGODB_URI is set:
  - Vector store -> MongoVectorStore (chunks in MongoDB, FAISS search in-memory)
  - Model registry -> MongoModelRegistry (versions in MongoDB)

When MONGODB_URI is absent (local dev):
  - Vector store -> PersistentVectorStore (JSON files on disk)
  - Model registry -> ModelRegistry (SQLite)
"""

import logging
import os
from typing import Optional

logger = logging.getLogger("wealthgenie.store_factory")


def get_vector_store(force_numpy: bool = False):
    """
    Returns the appropriate BaseVectorStore implementation.
    Uses MongoVectorStore when MONGODB_URI is set, else PersistentVectorStore.
    """
    mongo_uri = os.environ.get("MONGODB_URI", "")

    if mongo_uri:
        try:
            from rag.vector_store.mongo_vector_store import MongoVectorStore
            store = MongoVectorStore(
                mongo_uri=mongo_uri,
                db_name="wealthgenie",
                collection_name="vector_chunks",
                force_numpy=force_numpy,
            )
            logger.info(f"Using MongoVectorStore (backend=mongodb)")
            return store
        except Exception as e:
            logger.error(f"Failed to initialize MongoVectorStore: {e}. Falling back to PersistentVectorStore.")

    from rag.vector_store.memory_vector_store import PersistentVectorStore
    store = PersistentVectorStore(force_numpy=force_numpy)
    logger.info("Using PersistentVectorStore (backend=local_disk)")
    return store


def get_model_registry(db_path=None):
    """
    Returns the appropriate model registry implementation.
    Uses MongoModelRegistry when MONGODB_URI is set, else SQLite ModelRegistry.
    """
    mongo_uri = os.environ.get("MONGODB_URI", "")

    if mongo_uri:
        try:
            from model.registry.mongo_registry_store import MongoModelRegistry
            registry = MongoModelRegistry(
                mongo_uri=mongo_uri,
                db_name="wealthgenie",
            )
            logger.info("Using MongoModelRegistry (backend=mongodb)")
            return registry
        except Exception as e:
            logger.error(f"Failed to initialize MongoModelRegistry: {e}. Falling back to SQLite ModelRegistry.")

    from model.registry.registry_store import ModelRegistry
    registry = ModelRegistry(db_path=db_path)
    logger.info("Using SQLite ModelRegistry (backend=local_disk)")
    return registry
