"""
WealthGenie RAG Subsystem - Abstract Reranker Interface
Defines the provider contract for cross-encoder and future reranking strategies.
"""

from abc import ABC, abstractmethod
from typing import List
from rag.schema import RetrievedChunk


class BaseReranker(ABC):
    """Abstract base class for all reranking strategies."""

    @abstractmethod
    def rerank(self, query: str, chunks: List[RetrievedChunk]) -> List[RetrievedChunk]:
        """
        Reranks a list of retrieved chunks based on relevance to the query.
        Returns a new list sorted by reranked relevance, with updated scores and ranks.
        """
        pass

    @property
    @abstractmethod
    def reranker_name(self) -> str:
        """Returns a human-readable identifier for this reranker."""
        pass
