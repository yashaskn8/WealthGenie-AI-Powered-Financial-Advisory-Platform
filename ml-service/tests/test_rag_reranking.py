"""
WealthGenie RAG Subsystem - Reranking Pipeline Test Suite
Tests BaseReranker contract, NoOpReranker, RelevanceScoreReranker, and reranker integration in RAGPipeline.
"""

import pytest
from rag.reranking.base import BaseReranker
from rag.reranking.noop_reranker import NoOpReranker
from rag.reranking.relevance_reranker import RelevanceScoreReranker
from rag.retrieval.pipeline import get_reranker
from rag.schema import RetrievedChunk, TextChunk, ChunkMetadata


def _make_chunk(chunk_id: str, content: str, title: str, score: float, rank: int) -> RetrievedChunk:
    meta = ChunkMetadata(
        chunk_id=chunk_id,
        document_id="doc1",
        chunk_index=0,
        title=title,
        source="test.md",
    )
    chunk = TextChunk(chunk_id=chunk_id, document_id="doc1", content=content, metadata=meta)
    return RetrievedChunk(chunk=chunk, score=score, rank=rank)


def test_noop_reranker_preserves_order():
    chunks = [
        _make_chunk("c1", "Section 80C ELSS mutual fund deduction", "Tax 80C", 0.9, 1),
        _make_chunk("c2", "Fixed deposits earn guaranteed returns", "FD Guide", 0.7, 2),
    ]
    reranker = NoOpReranker()
    result = reranker.rerank("ELSS deduction", chunks)

    assert len(result) == 2
    assert result[0].chunk.chunk_id == "c1"
    assert result[1].chunk.chunk_id == "c2"
    assert result[0].score == 0.9
    assert reranker.reranker_name == "no_op"


def test_relevance_reranker_boosts_keyword_match():
    chunks = [
        _make_chunk("c1", "Fixed deposits earn guaranteed returns", "FD Guide", 0.85, 1),
        _make_chunk("c2", "Section 80C ELSS mutual fund deduction limit 1.5 Lakhs", "Tax 80C", 0.75, 2),
    ]
    reranker = RelevanceScoreReranker()
    result = reranker.rerank("Section 80C ELSS deduction limit", chunks)

    # c2 should be promoted due to higher keyword overlap
    assert result[0].chunk.chunk_id == "c2"
    assert result[0].rank == 1
    assert result[1].rank == 2
    assert reranker.reranker_name == "relevance_score"


def test_relevance_reranker_handles_empty_chunks():
    reranker = RelevanceScoreReranker()
    result = reranker.rerank("anything", [])
    assert result == []


def test_get_reranker_resolves_strategies():
    noop = get_reranker("no_op")
    assert isinstance(noop, NoOpReranker)

    relevance = get_reranker("relevance_score")
    assert isinstance(relevance, RelevanceScoreReranker)

    fallback = get_reranker("unknown_strategy")
    assert isinstance(fallback, NoOpReranker)


def test_reranker_is_abstract():
    with pytest.raises(TypeError):
        BaseReranker()
