"""
WealthGenie Hardened Production-Grade RAG Platform Package.
Exports core pipelines, configurations, retrievers, and schema definitions.
"""

from rag.config import RAGConfig
from rag.ingestion.pipeline import IngestionPipeline
from rag.retrieval.pipeline import RAGPipeline
from rag.schema import (
    Document,
    TextChunk,
    DocumentMetadata,
    ChunkMetadata,
    RetrievedChunk,
    RAGQueryRequest,
    RAGQueryResponse,
    Citation,
)

__version__ = "2.5.0"

__all__ = [
    "RAGConfig",
    "IngestionPipeline",
    "RAGPipeline",
    "Document",
    "TextChunk",
    "DocumentMetadata",
    "ChunkMetadata",
    "RetrievedChunk",
    "RAGQueryRequest",
    "RAGQueryResponse",
    "Citation",
]
