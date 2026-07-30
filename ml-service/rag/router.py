"""
WealthGenie RAG Subsystem - FastAPI Router
Exposes dedicated RAG endpoints (/rag/query, /rag/index, /rag/documents, /rag/status, /rag/health).
"""

import logging
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from rag.config import RAGConfig
from rag.ingestion.pipeline import IngestionPipeline
from rag.retrieval.pipeline import RAGPipeline
from rag.schema import RAGQueryRequest, RAGQueryResponse

logger = logging.getLogger("wealthgenie.rag.router")

rag_router = APIRouter(prefix="/rag", tags=["Retrieval-Augmented Generation"])

# Instantiate RAG Subsystem instances
rag_config = RAGConfig()
ingestion_pipeline = IngestionPipeline()
query_pipeline = RAGPipeline(
    embedder=ingestion_pipeline.embedder,
    vector_store=ingestion_pipeline.vector_store,
    config=rag_config,
)


class IngestTextRequest(BaseModel):
    title: str = Field(..., description="Document title")
    content: str = Field(..., min_length=10, description="Raw text content to ingest")
    source: str = Field("api_input", description="Source identifier")
    author: Optional[str] = Field("Financial Authority", description="Author")


@rag_router.get("/health")
def rag_health():
    """Health check for RAG subsystem."""
    stats = ingestion_pipeline.vector_store.get_stats()
    return {
        "status": "ok",
        "service": "WealthGenie RAG Platform",
        "chunks_indexed": stats["total_chunks"],
        "documents_indexed": stats["unique_documents"],
    }


@rag_router.get("/status")
def rag_status():
    """Returns vector store index metrics and embedding parameters."""
    stats = ingestion_pipeline.vector_store.get_stats()
    return {
        "vector_store_stats": stats,
        "embedding_provider": rag_config.embedding_provider,
        "embedding_dimension": rag_config.embedding_dim,
        "chunk_size": rag_config.chunk_size,
        "chunk_overlap": rag_config.chunk_overlap,
        "cache_hits": ingestion_pipeline.embedder.cache.hits if ingestion_pipeline.embedder.cache else 0,
        "cache_misses": ingestion_pipeline.embedder.cache.misses if ingestion_pipeline.embedder.cache else 0,
    }


@rag_router.post("/query", response_model=RAGQueryResponse)
def query_rag(request: RAGQueryRequest):
    """
    Executes grounded RAG query search over authoritative knowledge base.
    Returns answer, citations, evidence chunks, and timing metrics.
    """
    try:
        return query_pipeline.query(request)
    except Exception as e:
        logger.error(f"RAG query execution failed: {e}")
        raise HTTPException(status_code=500, detail=f"RAG query error: {str(e)}")


@rag_router.post("/index")
def index_document(request: IngestTextRequest):
    """
    Ingests text document into vector store index incrementally.
    """
    try:
        res = ingestion_pipeline.ingest_text(
            text=request.content,
            title=request.title,
            source=request.source,
            author=request.author,
        )
        return {"status": "success", "ingestion_result": res}
    except Exception as e:
        logger.error(f"Document ingestion failed: {e}")
        raise HTTPException(status_code=400, detail=f"Ingestion error: {str(e)}")


@rag_router.get("/documents")
def list_documents():
    """Lists metadata for all unique indexed documents in vector store."""
    stats = ingestion_pipeline.vector_store.get_stats()
    return {"status": "success", "document_summary": stats}
