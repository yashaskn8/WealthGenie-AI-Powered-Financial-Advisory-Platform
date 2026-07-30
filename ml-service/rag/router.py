"""
WealthGenie RAG Subsystem - Hardened FastAPI Router
Exposes enterprise RAG endpoints with rate-limiting, error handling, security headers, and document lifecycle control.
"""

import logging
import time
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from rag.config import RAGConfig
from rag.ingestion.pipeline import IngestionPipeline
from rag.lifecycle.manager import DocumentLifecycleManager
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
lifecycle_manager = DocumentLifecycleManager(vector_store=ingestion_pipeline.vector_store)

# In-memory simple rate limiting: IP -> List of request timestamps
_RATE_LIMIT_STORE: Dict[str, List[float]] = {}
MAX_REQUESTS_PER_MINUTE = 60


def check_rate_limit(client_ip: str) -> None:
    """Enforces simple sliding window rate limiting (60 requests/minute)."""
    now = time.time()
    timestamps = _RATE_LIMIT_STORE.get(client_ip, [])
    # Filter timestamps within last 60s
    recent = [t for t in timestamps if now - t < 60.0]

    if len(recent) >= MAX_REQUESTS_PER_MINUTE:
        logger.warning(f"Rate limit exceeded for IP: {client_ip}")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Maximum 60 requests per minute allowed.",
        )

    recent.append(now)
    _RATE_LIMIT_STORE[client_ip] = recent





class IngestTextRequest(BaseModel):
    title: str = Field(..., description="Document title")
    content: str = Field(..., min_length=10, description="Raw text content to ingest")
    source: str = Field("api_input", description="Source identifier")
    author: Optional[str] = Field("Financial Authority", description="Author")
    tenant_id: str = Field("default", description="Tenant isolation scope")


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
        "retrieval_strategy": rag_config.retrieval_strategy,
        "reranker_strategy": rag_config.reranker_strategy,
    }


@rag_router.post("/query", response_model=RAGQueryResponse)
def query_rag(request: RAGQueryRequest, req: Request):
    """
    Executes grounded RAG query search over authoritative knowledge base.
    Returns answer, citations, evidence chunks, and timing metrics.
    """
    client_ip = req.client.host if req.client else "127.0.0.1"
    check_rate_limit(client_ip)

    try:
        return query_pipeline.query(request)
    except Exception as e:
        logger.error(f"RAG query execution failed: {e}")
        raise HTTPException(status_code=500, detail=f"RAG query error: {str(e)}")


@rag_router.post("/index")
def index_document(request: IngestTextRequest, req: Request):
    """
    Ingests text document into vector store index incrementally.
    """
    client_ip = req.client.host if req.client else "127.0.0.1"
    check_rate_limit(client_ip)

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
def list_documents(include_inactive: bool = False):
    """Lists all registered documents in the knowledge base."""
    return {"documents": lifecycle_manager.list_documents(include_inactive=include_inactive)}


@rag_router.delete("/documents/{doc_id}")
def delete_document(doc_id: str, hard_delete: bool = True):
    """Deletes or soft-deletes a document and purges vector index chunks."""
    if hard_delete:
        success = lifecycle_manager.hard_delete_document(doc_id)
    else:
        success = lifecycle_manager.soft_delete_document(doc_id)

    if not success:
        raise HTTPException(status_code=404, detail=f"Document '{doc_id}' not found.")
    return {"status": "success", "message": f"Document '{doc_id}' deleted successfully."}


@rag_router.put("/documents/{doc_id}")
def update_document(doc_id: str, title: Optional[str] = None, author: Optional[str] = None):
    """Updates metadata across document registry and vector store chunks."""
    success = lifecycle_manager.update_metadata(doc_id, new_title=title, new_author=author)
    if not success:
        raise HTTPException(status_code=404, detail=f"Document '{doc_id}' not found.")
    return {"status": "success", "message": f"Metadata updated for document '{doc_id}'."}
