"""
WealthGenie RAG Subsystem - Abstract Retriever Interface
Defines the standard strategy interface for retrieval mechanisms (Dense, Keyword/BM25, Hybrid).
"""

from abc import ABC, abstractmethod
from typing import List
from rag.schema import RetrievedChunk


class BaseRetriever(ABC):
    """Abstract base class for all chunk retrieval strategies."""

    @abstractmethod
    def retrieve(self, query: str, top_k: int = 4, threshold: float = 0.0) -> List[RetrievedChunk]:
        """Retrieves and ranks relevant chunks for the given query text."""
        pass

    @property
    @abstractmethod
    def strategy_name(self) -> str:
        """Returns the strategy identifier name."""
        pass
