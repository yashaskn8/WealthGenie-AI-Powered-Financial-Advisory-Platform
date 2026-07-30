"""
WealthGenie RAG Subsystem - Hybrid Retriever
Combines Dense Vector and BM25 Keyword retrieval using Reciprocal Rank Fusion (RRF) or Weighted Score Fusion.
"""

from typing import List, Dict, Optional
from rag.retrievers.base import BaseRetriever
from rag.retrievers.bm25_retriever import BM25KeywordRetriever
from rag.retrievers.dense_retriever import DenseRetriever
from rag.schema import TextChunk, RetrievedChunk


class HybridRetriever(BaseRetriever):
    """
    Hybrid retriever combining semantic dense retrieval and keyword BM25 search.
    Supports fusion_mode = 'rrf' (Reciprocal Rank Fusion) or 'weighted'.
    """

    def __init__(
        self,
        dense_retriever: Optional[DenseRetriever] = None,
        keyword_retriever: Optional[BM25KeywordRetriever] = None,
        fusion_mode: str = "rrf",
        dense_weight: float = 0.6,
        keyword_weight: float = 0.4,
        rrf_k: int = 60,
    ):
        self.dense_retriever = dense_retriever or DenseRetriever()
        self.keyword_retriever = keyword_retriever or BM25KeywordRetriever(vector_store=self.dense_retriever.vector_store)
        self.fusion_mode = fusion_mode
        self.dense_weight = dense_weight
        self.keyword_weight = keyword_weight
        self.rrf_k = rrf_k

    @property
    def strategy_name(self) -> str:
        return f"hybrid_{self.fusion_mode}"

    def retrieve(self, query: str, top_k: int = 4, threshold: float = 0.0) -> List[RetrievedChunk]:
        """Retrieves candidates from both dense and keyword retrievers and fuses ranks/scores."""
        candidate_k = top_k * 2
        dense_results = self.dense_retriever.retrieve(query, top_k=candidate_k, threshold=0.0)
        keyword_results = self.keyword_retriever.retrieve(query, top_k=candidate_k, threshold=0.0)

        if not dense_results and not keyword_results:
            return []
        if not dense_results:
            return keyword_results[:top_k]
        if not keyword_results:
            return dense_results[:top_k]

        if self.fusion_mode == "weighted":
            return self._weighted_fusion(dense_results, keyword_results, top_k, threshold)
        else:
            return self._rrf_fusion(dense_results, keyword_results, top_k, threshold)

    def _rrf_fusion(
        self,
        dense_results: List[RetrievedChunk],
        keyword_results: List[RetrievedChunk],
        top_k: int,
        threshold: float,
    ) -> List[RetrievedChunk]:
        """Reciprocal Rank Fusion: RRF(d) = sum_m(1 / (k + rank_m(d)))."""
        rrf_scores: Dict[str, float] = {}
        chunks_map: Dict[str, TextChunk] = {}

        for rank, ret in enumerate(dense_results, start=1):
            cid = ret.chunk.chunk_id
            chunks_map[cid] = ret.chunk
            rrf_scores[cid] = rrf_scores.get(cid, 0.0) + (1.0 / (self.rrf_k + rank))

        for rank, ret in enumerate(keyword_results, start=1):
            cid = ret.chunk.chunk_id
            chunks_map[cid] = ret.chunk
            rrf_scores[cid] = rrf_scores.get(cid, 0.0) + (1.0 / (self.rrf_k + rank))

        # Normalize RRF scores to [0.0, 1.0]
        max_rrf = max(rrf_scores.values()) if rrf_scores else 1.0

        sorted_cids = sorted(rrf_scores.keys(), key=lambda cid: rrf_scores[cid], reverse=True)

        results: List[RetrievedChunk] = []
        for rank, cid in enumerate(sorted_cids[:top_k], start=1):
            norm_score = round(rrf_scores[cid] / max_rrf, 4)
            if norm_score >= threshold:
                results.append(
                    RetrievedChunk(
                        chunk=chunks_map[cid],
                        score=norm_score,
                        rank=rank,
                    )
                )

        return results

    def _weighted_fusion(
        self,
        dense_results: List[RetrievedChunk],
        keyword_results: List[RetrievedChunk],
        top_k: int,
        threshold: float,
    ) -> List[RetrievedChunk]:
        """Weighted Score Fusion: Score(d) = w_dense * S_dense + w_bm25 * S_bm25."""
        combined_scores: Dict[str, float] = {}
        chunks_map: Dict[str, TextChunk] = {}

        for ret in dense_results:
            cid = ret.chunk.chunk_id
            chunks_map[cid] = ret.chunk
            combined_scores[cid] = combined_scores.get(cid, 0.0) + self.dense_weight * ret.score

        for ret in keyword_results:
            cid = ret.chunk.chunk_id
            chunks_map[cid] = ret.chunk
            combined_scores[cid] = combined_scores.get(cid, 0.0) + self.keyword_weight * ret.score

        sorted_cids = sorted(combined_scores.keys(), key=lambda cid: combined_scores[cid], reverse=True)

        results: List[RetrievedChunk] = []
        for rank, cid in enumerate(sorted_cids[:top_k], start=1):
            score = round(combined_scores[cid], 4)
            if score >= threshold:
                results.append(
                    RetrievedChunk(
                        chunk=chunks_map[cid],
                        score=score,
                        rank=rank,
                    )
                )

        return results
