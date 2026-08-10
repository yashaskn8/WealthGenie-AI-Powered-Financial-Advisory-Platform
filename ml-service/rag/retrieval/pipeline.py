"""
WealthGenie RAG Subsystem - End-to-End Retrieval & Generation Pipeline
Executes strategy retrieval (Dense, Keyword, Hybrid), reranking, prompt assembly, answer generation, and citation formatting.
"""

import logging
import time
from typing import Dict, Any, List, Optional

from rag.citations.engine import CitationEngine
from rag.config import RAGConfig
from rag.embeddings.base import BaseEmbeddingProvider
from rag.embeddings.dense_embedding import get_embedding_provider
from rag.prompts.builder import PromptBuilder
from rag.reranking.base import BaseReranker
from rag.reranking.noop_reranker import NoOpReranker
from rag.reranking.relevance_reranker import RelevanceScoreReranker
from rag.reranking.cross_encoder_reranker import CrossEncoderReranker
from rag.retrievers.base import BaseRetriever
from rag.retrievers.bm25_retriever import BM25KeywordRetriever
from rag.retrievers.dense_retriever import DenseRetriever
from rag.retrievers.hybrid_retriever import HybridRetriever
from rag.schema import RAGQueryRequest, RAGQueryResponse, RetrievedChunk
from rag.vector_store.base import BaseVectorStore
from rag.vector_store.memory_vector_store import PersistentVectorStore

logger = logging.getLogger("wealthgenie.rag.retrieval")

from rag.cache.manager import MultiLevelCacheManager
from rag.observability.metrics_collector import RAGObservabilityCollector
from rag.query_understanding.pipeline import QueryUnderstandingPipeline

# Registry of built-in reranker strategies
_RERANKER_REGISTRY: Dict[str, type] = {
    "no_op": NoOpReranker,
    "relevance_score": RelevanceScoreReranker,
    "cross_encoder": CrossEncoderReranker,
}


def get_reranker(strategy: str) -> BaseReranker:
    """Resolves a reranker instance from the strategy name."""
    cls = _RERANKER_REGISTRY.get(strategy)
    if cls is None:
        logger.warning(f"Unknown reranker strategy '{strategy}', falling back to no_op.")
        return NoOpReranker()
    return cls()


def get_retriever(
    strategy: str,
    embedder: BaseEmbeddingProvider,
    vector_store: BaseVectorStore,
    config: RAGConfig,
) -> BaseRetriever:
    """Resolves a retriever instance based on configured strategy (dense, keyword, hybrid)."""
    if strategy == "dense":
        return DenseRetriever(embedder=embedder, vector_store=vector_store)
    elif strategy == "keyword":
        return BM25KeywordRetriever(vector_store=vector_store)
    elif strategy == "hybrid":
        dense_ret = DenseRetriever(embedder=embedder, vector_store=vector_store)
        keyword_ret = BM25KeywordRetriever(vector_store=vector_store)
        return HybridRetriever(
            dense_retriever=dense_ret,
            keyword_retriever=keyword_ret,
            fusion_mode=config.fusion_mode,
            dense_weight=config.dense_weight,
            keyword_weight=config.keyword_weight,
        )
    else:
        logger.warning(f"Unknown retrieval strategy '{strategy}', falling back to dense.")
        return DenseRetriever(embedder=embedder, vector_store=vector_store)


class RAGPipeline:
    """End-to-End Retrieval-Augmented Generation pipeline with strategy retrieval, reranking, and multi-level caching."""

    def __init__(
        self,
        embedder: Optional[BaseEmbeddingProvider] = None,
        vector_store: Optional[BaseVectorStore] = None,
        retriever: Optional[BaseRetriever] = None,
        reranker: Optional[BaseReranker] = None,
        query_understanding: Optional[QueryUnderstandingPipeline] = None,
        cache_manager: Optional[MultiLevelCacheManager] = None,
        telemetry: Optional[RAGObservabilityCollector] = None,
        config: Optional[RAGConfig] = None,
    ):
        self.config = config or RAGConfig()
        self.embedder = embedder or get_embedding_provider(self.config)
        self.vector_store = vector_store or PersistentVectorStore()
        self.retriever = retriever or get_retriever(
            strategy=self.config.retrieval_strategy,
            embedder=self.embedder,
            vector_store=self.vector_store,
            config=self.config,
        )
        self.reranker = reranker or get_reranker(self.config.reranker_strategy)
        self.query_understanding = query_understanding or QueryUnderstandingPipeline()
        self.cache_manager = cache_manager or MultiLevelCacheManager()
        self.telemetry = telemetry or RAGObservabilityCollector()
        self.prompt_builder = PromptBuilder()
        self.citation_engine = CitationEngine()

    def query(self, request: RAGQueryRequest) -> RAGQueryResponse:
        """Executes full RAG query workflow and returns grounded response with citations."""
        # Check Response Cache
        cached_response = self.cache_manager.get_response(request.question, tenant_id=request.tenant_id)
        if cached_response is not None:
            logger.info(f"Serving cached RAG query response for '{request.question[:30]}...' (tenant: {request.tenant_id})")
            return cached_response

        start_time = time.perf_counter()
        top_k = request.top_k or self.config.top_k

        # 1. Query Understanding & Expansion
        t0 = time.perf_counter()
        qu_result = self.query_understanding.process(request.question)
        search_query = qu_result["search_query"]
        qu_latency = (time.perf_counter() - t0) * 1000.0

        # 2. Strategy Retrieval
        t1 = time.perf_counter()
        retrieval_top_k = top_k * 2 if self.reranker.reranker_name != "no_op" else top_k
        retrieved_chunks = self.retriever.retrieve(
            query=search_query,
            top_k=retrieval_top_k,
            threshold=self.config.similarity_threshold,
            tenant_id=request.tenant_id,
        )
        retrieval_latency = (time.perf_counter() - t1) * 1000.0

        # 3. Rerank Retrieved Chunks
        t2 = time.perf_counter()
        reranked_chunks = self.reranker.rerank(request.question, retrieved_chunks)
        reranking_latency = (time.perf_counter() - t2) * 1000.0

        # Trim to final top_k after reranking
        final_chunks = reranked_chunks[:top_k]

        # 4. Assemble Prompt Context
        t3 = time.perf_counter()
        prompt = self.prompt_builder.build_prompt(
            question=request.question,
            retrieved_chunks=final_chunks,
            user_profile=request.user_profile,
        )
        prompt_latency = (time.perf_counter() - t3) * 1000.0

        # 5. Generate Answer (Grounded Synthesis)
        t4 = time.perf_counter()
        answer = self._generate_grounded_answer(request.question, final_chunks)
        answer_latency = (time.perf_counter() - t4) * 1000.0

        # 6. Extract Citations
        citations = self.citation_engine.generate_citations(final_chunks)
        if request.include_citations and citations:
            answer += self.citation_engine.format_citations_markdown(citations)

        total_latency = (time.perf_counter() - start_time) * 1000.0

        # Record Telemetry Trace
        context_char_len = sum(len(c.chunk.content) for c in final_chunks)
        top_score = final_chunks[0].score if final_chunks else 0.0
        cache_hits = getattr(self.embedder.cache, "hits", 0) if getattr(self.embedder, "cache", None) else 0
        cache_misses = getattr(self.embedder.cache, "misses", 0) if getattr(self.embedder, "cache", None) else 0

        self.telemetry.record_query_trace(
            query=request.question,
            search_query=search_query,
            retrieval_strategy=self.retriever.strategy_name,
            reranker_strategy=self.reranker.reranker_name,
            stage_latencies_ms={
                "query_understanding": qu_latency,
                "retrieval": retrieval_latency,
                "reranking": reranking_latency,
                "prompt_assembly": prompt_latency,
                "answer_synthesis": answer_latency,
            },
            chunks_retrieved=len(retrieved_chunks),
            chunks_after_rerank=len(final_chunks),
            context_char_count=context_char_len,
            citation_count=len(citations),
            top_score=top_score,
            cache_hits=cache_hits,
            cache_misses=cache_misses,
        )

        metrics = {
            "query_understanding_latency_ms": round(qu_latency, 2),
            "intent": qu_result["intent"],
            "retrieval_strategy": self.retriever.strategy_name,
            "retrieval_latency_ms": round(retrieval_latency, 2),
            "reranking_latency_ms": round(reranking_latency, 2),
            "prompt_assembly_latency_ms": round(prompt_latency, 2),
            "answer_synthesis_latency_ms": round(answer_latency, 2),
            "total_latency_ms": round(total_latency, 2),
            "chunks_retrieved": len(retrieved_chunks),
            "chunks_after_reranking": len(final_chunks),
            "reranker": self.reranker.reranker_name,
            "top_score": top_score,
        }

        response = RAGQueryResponse(
            answer=answer,
            citations=citations,
            retrieved_chunks=final_chunks,
            metrics=metrics,
            grounded=len(final_chunks) > 0,
        )
        self.cache_manager.put_response(request.question, response, tenant_id=request.tenant_id)
        return response

    def _generate_grounded_answer(self, question: str, retrieved_chunks: List[RetrievedChunk]) -> str:
        """Synthesizes an advisory answer strictly grounded in retrieved evidence."""
        if not retrieved_chunks:
            return (
                "I cannot find authoritative details on this in the knowledge base. "
                "Please consult a certified financial advisor or upload relevant documentation."
            )

        # Synthesize top evidence excerpts cleanly
        excerpts = []
        for idx, ret in enumerate(retrieved_chunks, start=1):
            excerpts.append(f"According to **{ret.chunk.metadata.title}** [{idx}]:\n{ret.chunk.content}")

        body = "\n\n".join(excerpts)
        return f"Based on authoritative financial documentation:\n\n{body}"
