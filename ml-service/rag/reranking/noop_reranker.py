"""
WealthGenie RAG Subsystem - No-Op Reranker (Pass-Through)
Identity reranker that preserves original retrieval ordering.
Used as the default when no cross-encoder model is configured.
"""

from typing import List
from rag.reranking.base import BaseReranker
from rag.schema import RetrievedChunk


class NoOpReranker(BaseReranker):
    """Pass-through reranker that returns chunks in their original retrieval order."""

    def rerank(self, query: str, chunks: List[RetrievedChunk]) -> List[RetrievedChunk]:
        """Returns chunks unchanged, preserving original retrieval scores and ranks."""
        return chunks

    @property
    def reranker_name(self) -> str:
        return "no_op"
