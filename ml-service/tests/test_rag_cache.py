"""
WealthGenie RAG Subsystem - Multi-Level Cache Test Suite
Tests response caching, retrieval caching, TTL expiration, invalidation, and pipeline cache integration.
"""

import time
from rag.cache.manager import MultiLevelCacheManager, CacheItem
from rag.config import RAGConfig
from rag.embeddings.dense_embedding import DenseVectorEmbeddingProvider
from rag.vector_store.memory_vector_store import PersistentVectorStore
from rag.retrieval.pipeline import RAGPipeline
from rag.schema import RAGQueryRequest, RAGQueryResponse


def test_cache_item_ttl_expiration():
    item = CacheItem("test_value", ttl_seconds=0.1)
    assert not item.is_expired()
    time.sleep(0.15)
    assert item.is_expired()


def test_response_cache_hit_and_miss():
    manager = MultiLevelCacheManager(response_ttl=10.0)

    query = "What is Section 87A rebate?"
    assert manager.get_response(query) is None
    assert manager.stats["response_misses"] == 1

    dummy_response = RAGQueryResponse(
        answer="Section 87A rebate gives zero tax for income up to 12 Lakhs.",
        citations=[],
        retrieved_chunks=[],
        metrics={"total_latency_ms": 1.5},
        grounded=True,
    )

    manager.put_response(query, dummy_response)

    cached = manager.get_response(query)
    assert cached is not None
    assert cached.answer == dummy_response.answer
    assert manager.stats["response_hits"] == 1


def test_cache_invalidation_and_stats():
    manager = MultiLevelCacheManager()
    manager.put_response("query1", RAGQueryResponse(answer="a1", citations=[], retrieved_chunks=[], metrics={}, grounded=True))

    stats_before = manager.get_cache_stats()
    assert stats_before["response_cache_size"] == 1

    manager.invalidate_all()
    stats_after = manager.get_cache_stats()
    assert stats_after["response_cache_size"] == 0


def test_rag_pipeline_response_caching_integration(tmp_path):
    config = RAGConfig(vector_store_path=tmp_path / "cache_index.json", embedding_dim=64)
    embedder = DenseVectorEmbeddingProvider(dimension=64, enable_cache=False)
    vector_store = PersistentVectorStore(index_path=tmp_path / "cache_index.json")
    cache_mgr = MultiLevelCacheManager()

    pipeline = RAGPipeline(embedder=embedder, vector_store=vector_store, cache_manager=cache_mgr, config=config)
    req = RAGQueryRequest(question="How much deduction is allowed under 80C?")

    # First query -> Miss
    res1 = pipeline.query(req)
    assert cache_mgr.stats["response_misses"] == 1

    # Second query -> Hit
    res2 = pipeline.query(req)
    assert cache_mgr.stats["response_hits"] == 1
    assert res1.answer == res2.answer
