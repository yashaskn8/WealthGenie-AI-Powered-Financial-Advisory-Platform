"""
WealthGenie RAG Subsystem - Relevance Score Reranker
Lightweight heuristic reranker that rescores chunks using query-term overlap and positional weighting.
Demonstrates the reranking provider pattern without requiring external model dependencies.
"""

import re
from typing import List
from rag.reranking.base import BaseReranker
from rag.schema import RetrievedChunk


class RelevanceScoreReranker(BaseReranker):
    """
    Heuristic reranker that combines the original retrieval score with
    keyword overlap and positional relevance signals.

    Reranking formula per chunk:
        reranked_score = α * original_score + β * keyword_overlap + γ * title_match_bonus
    where α + β + γ = 1.0
    """

    def __init__(self, alpha: float = 0.5, beta: float = 0.35, gamma: float = 0.15):
        self.alpha = alpha
        self.beta = beta
        self.gamma = gamma

    def rerank(self, query: str, chunks: List[RetrievedChunk]) -> List[RetrievedChunk]:
        """Rescores and resorts chunks using term-overlap heuristic signals."""
        if not chunks:
            return chunks

        query_terms = self._extract_terms(query)
        scored_chunks: List[RetrievedChunk] = []

        for chunk in chunks:
            keyword_overlap = self._compute_keyword_overlap(query_terms, chunk.chunk.content)
            title_match_bonus = self._compute_title_match(query_terms, chunk.chunk.metadata.title)

            reranked_score = (
                self.alpha * chunk.score
                + self.beta * keyword_overlap
                + self.gamma * title_match_bonus
            )

            scored_chunks.append(
                RetrievedChunk(
                    chunk=chunk.chunk,
                    score=round(reranked_score, 4),
                    rank=0,  # Will be reassigned below
                )
            )

        # Sort by reranked score descending
        scored_chunks.sort(key=lambda c: c.score, reverse=True)

        # Reassign ranks
        reranked = []
        for rank, c in enumerate(scored_chunks, start=1):
            reranked.append(
                RetrievedChunk(chunk=c.chunk, score=c.score, rank=rank)
            )

        return reranked

    @property
    def reranker_name(self) -> str:
        return "relevance_score"

    @staticmethod
    def _extract_terms(text: str) -> set:
        """Extracts lowercase terms from text, filtering short stop words."""
        cleaned = re.sub(r"[^\w\s]", " ", text.lower())
        return {w for w in cleaned.split() if len(w) > 2}

    @staticmethod
    def _compute_keyword_overlap(query_terms: set, content: str) -> float:
        """Computes fraction of query terms found in chunk content."""
        if not query_terms:
            return 0.0
        content_lower = content.lower()
        matches = sum(1 for t in query_terms if t in content_lower)
        return float(matches / len(query_terms))

    @staticmethod
    def _compute_title_match(query_terms: set, title: str) -> float:
        """Returns 1.0 if any query term appears in the document title, 0.0 otherwise."""
        if not query_terms or not title:
            return 0.0
        title_lower = title.lower()
        return 1.0 if any(t in title_lower for t in query_terms) else 0.0
