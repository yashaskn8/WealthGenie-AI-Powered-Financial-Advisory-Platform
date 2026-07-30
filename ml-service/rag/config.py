"""
WealthGenie RAG Subsystem - Central Configuration
Defines hyperparameters for chunking, vector embeddings, storage paths, and retrieval bounds.
"""

from pathlib import Path
from pydantic import BaseModel, Field
from model.config import BASE_DIR

RAG_DIR = BASE_DIR / "rag"
STORAGE_DIR = BASE_DIR / "reports" / "rag_store"
STORAGE_DIR.mkdir(parents=True, exist_ok=True)


class RAGConfig(BaseModel):
    """Centralized configuration for Retrieval-Augmented Generation pipeline."""
    chunk_size: int = Field(512, ge=64, le=4096, description="Default chunk size in characters")
    chunk_overlap: int = Field(64, ge=0, le=512, description="Overlap between consecutive chunks")
    embedding_dim: int = Field(128, description="Dense embedding vector dimension")
    embedding_provider: str = Field("tf_idf_dense", description="Embedding provider: tf_idf_dense, sentence_transformer, or custom")
    top_k: int = Field(4, ge=1, le=20, description="Top-k chunks to retrieve")
    similarity_threshold: float = Field(0.1, ge=0.0, le=1.0, description="Minimum cosine similarity score")
    reranker_strategy: str = Field("no_op", description="Reranker strategy: no_op, relevance_score, or cross_encoder")
    vector_store_path: Path = Field(STORAGE_DIR / "vector_index.json", description="Persisted vector store index path")
    cache_path: Path = Field(STORAGE_DIR / "embedding_cache.json", description="Persisted embedding cache path")
    document_registry_path: Path = Field(STORAGE_DIR / "documents.json", description="Document metadata store path")
