"""
WealthGenie RAG Subsystem - End-to-End Retrieval & Generation Pipeline
Executes query embedding, similarity search, reranking, prompt assembly, answer generation, and citation formatting.
"""

import logging
import time
from typing import Dict, Any, List, Optional

from rag.citations.engine import CitationEngine
from rag.config import RAGConfig
from rag.embeddings.base import BaseEmbeddingProvider
from rag.embeddings.dense_embedding import DenseVectorEmbeddingProvider
from rag.prompts.builder import PromptBuilder
from rag.reranking.base import BaseReranker
from rag.reranking.noop_reranker import NoOpReranker
from rag.reranking.relevance_reranker import RelevanceScoreReranker
from rag.schema import RAGQueryRequest, RAGQueryResponse, RetrievedChunk
from rag.vector_store.base import BaseVectorStore
from rag.vector_store.memory_vector_store import PersistentVectorStore

logger = logging.getLogger("wealthgenie.rag.retrieval")

# Registry of built-in reranker strategies
_RERANKER_REGISTRY: Dict[str, type] = {
    "no_op": NoOpReranker,
    "relevance_score": RelevanceScoreReranker,
}


def get_reranker(strategy: str) -> BaseReranker:
    """Resolves a reranker instance from the strategy name."""
    cls = _RERANKER_REGISTRY.get(strategy)
    if cls is None:
        logger.warning(f"Unknown reranker strategy '{strategy}', falling back to no_op.")
        return NoOpReranker()
    return cls()


class RAGPipeline:
    """End-to-End Retrieval-Augmented Generation pipeline with optional reranking."""

    def __init__(
        self,
        embedder: Optional[BaseEmbeddingProvider] = None,
        vector_store: Optional[BaseVectorStore] = None,
        reranker: Optional[BaseReranker] = None,
        config: Optional[RAGConfig] = None,
    ):
        self.config = config or RAGConfig()
        self.embedder = embedder or DenseVectorEmbeddingProvider(dimension=self.config.embedding_dim)
        self.vector_store = vector_store or PersistentVectorStore()
        self.reranker = reranker or get_reranker(self.config.reranker_strategy)
        self.prompt_builder = PromptBuilder()
        self.citation_engine = CitationEngine()

    def query(self, request: RAGQueryRequest) -> RAGQueryResponse:
        """Executes full RAG query workflow and returns grounded response with citations."""
        start_time = time.perf_counter()
        top_k = request.top_k or self.config.top_k

        # 1. Embed Query Question
        t0 = time.perf_counter()
        query_vector = self.embedder.embed_text(request.question)
        embedding_latency = (time.perf_counter() - t0) * 1000.0

        # 2. Similarity Vector Search (retrieve more candidates for reranking)
        t1 = time.perf_counter()
        retrieval_top_k = top_k * 2 if self.reranker.reranker_name != "no_op" else top_k
        retrieved_chunks = self.vector_store.search(
            query_vector=query_vector,
            top_k=retrieval_top_k,
            threshold=self.config.similarity_threshold,
        )
        retrieval_latency = (time.perf_counter() - t1) * 1000.0

        # 3. Rerank Retrieved Chunks
        t2 = time.perf_counter()
        reranked_chunks = self.reranker.rerank(request.question, retrieved_chunks)
        reranking_latency = (time.perf_counter() - t2) * 1000.0

        # Trim to final top_k after reranking
        final_chunks = reranked_chunks[:top_k]

        # 4. Assemble Prompt Context
        prompt = self.prompt_builder.build_prompt(
            question=request.question,
            retrieved_chunks=final_chunks,
            user_profile=request.user_profile,
        )

        # 5. Generate Answer (Grounded Synthesis)
        answer = self._generate_grounded_answer(request.question, final_chunks)

        # 6. Extract Citations
        citations = self.citation_engine.generate_citations(final_chunks)
        if request.include_citations and citations:
            answer += self.citation_engine.format_citations_markdown(citations)

        total_latency = (time.perf_counter() - start_time) * 1000.0

        metrics = {
            "embedding_latency_ms": round(embedding_latency, 2),
            "retrieval_latency_ms": round(retrieval_latency, 2),
            "reranking_latency_ms": round(reranking_latency, 2),
            "total_latency_ms": round(total_latency, 2),
            "chunks_retrieved": len(retrieved_chunks),
            "chunks_after_reranking": len(final_chunks),
            "reranker": self.reranker.reranker_name,
            "top_score": final_chunks[0].score if final_chunks else 0.0,
        }

        return RAGQueryResponse(
            answer=answer,
            citations=citations,
            retrieved_chunks=final_chunks,
            metrics=metrics,
            grounded=len(final_chunks) > 0,
        )

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
