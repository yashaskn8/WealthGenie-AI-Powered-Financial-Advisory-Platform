"""
WealthGenie RAG Subsystem - Data Models & Schemas
Defines Pydantic data contracts for documents, chunks, queries, citations, and metrics.
"""

from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field


class DocumentMetadata(BaseModel):
    """Metadata retained for every ingested document."""
    title: str = Field(..., description="Document title")
    source: str = Field(..., description="File path, URL, or authoritative source name")
    publication_date: str = Field(default_factory=lambda: datetime.now(timezone.utc).strftime("%Y-%m-%d"), description="Publication date (YYYY-MM-DD)")
    document_type: str = Field("markdown", description="pdf, markdown, text, html, or csv")
    version: str = Field("1.0", description="Document schema version")
    author: Optional[str] = Field(None, description="Authoring authority (e.g. Income Tax Dept, AMFI)")
    effective_date: str = Field(default_factory=lambda: datetime.now(timezone.utc).strftime("%Y-%m-%d"), description="Effective date of regulations (YYYY-MM-DD)")
    source_trust_tier: str = Field("government_official", description="government_official, regulatory_circular, or internal_analysis")
    tenant_id: str = Field("default", description="Tenant isolation scope identifier")
    custom_metadata: Dict[str, Any] = Field(default_factory=dict)


class Document(BaseModel):
    """Raw loaded document representation."""
    document_id: str = Field(..., description="Unique SHA256 or UUID document identifier")
    content: str = Field(..., description="Full text content of document")
    metadata: DocumentMetadata


class ChunkMetadata(DocumentMetadata):
    """Metadata retained for individual document text chunks."""
    chunk_id: str = Field(..., description="Unique chunk identifier document_id#idx")
    document_id: str = Field(..., description="Parent document identifier")
    chunk_index: int = Field(..., description="Ordinal index of chunk within parent document")
    page_number: Optional[int] = Field(None, description="Page number if applicable")
    token_count: int = Field(0, description="Character or token length of chunk")


class TextChunk(BaseModel):
    """Granular chunk used for vector embedding and retrieval."""
    chunk_id: str
    document_id: str
    content: str
    metadata: ChunkMetadata
    tenant_id: str = Field("default", description="Tenant isolation scope identifier")
    embedding: Optional[List[float]] = None


class RetrievedChunk(BaseModel):
    """Chunk retrieved during vector search along with score and rank."""
    chunk: TextChunk
    score: float = Field(..., description="Cosine similarity score [0.0, 1.0]")
    rank: int = Field(..., description="Retrieval rank position (1-based)")


class Citation(BaseModel):
    """Structured reference citation attached to generated advisory responses."""
    citation_id: int = Field(..., description="Numerical reference index [1], [2], ...")
    document_title: str
    source: str
    chunk_id: str
    excerpt: str = Field(..., description="Relevant supporting text excerpt")
    relevance_score: float


class RAGQueryRequest(BaseModel):
    """Request payload for RAG query execution."""
    question: str = Field(..., min_length=3, description="User advisory question")
    top_k: Optional[int] = Field(None, ge=1, le=20, description="Override default top-k retrieval count")
    tenant_id: str = Field("default", description="Tenant isolation scope identifier")
    user_profile: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Contextual investor profile")
    include_citations: bool = Field(True, description="Whether to format inline citations")


class RAGQueryResponse(BaseModel):
    """Grounded response returned by RAG query pipeline."""
    answer: str = Field(..., description="Generated advisory response grounded in retrieved evidence")
    citations: List[Citation] = Field(default_factory=list)
    retrieved_chunks: List[RetrievedChunk] = Field(default_factory=list)
    metrics: Dict[str, Any] = Field(default_factory=dict, description="Retrieval, embedding, and generation latencies")
    grounded: bool = Field(True, description="Flag indicating response is fully supported by evidence")
