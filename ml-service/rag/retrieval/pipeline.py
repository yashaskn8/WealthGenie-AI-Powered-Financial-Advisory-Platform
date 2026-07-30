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
from rag.schema import RAGQueryRequest, RAGQueryResponse, RetrievedChunk
from rag.vector_store.base import BaseVectorStore
from rag.vector_store.memory_vector_store import PersistentVectorStore

logger = logging.getLogger("wealthgenie.rag.retrieval")


class RAGPipeline:
    """End-to-End Retrieval-Augmented Generation pipeline."""

    def __init__(
        self,
        embedder: Optional[BaseEmbeddingProvider] = None,
        vector_store: Optional[BaseVectorStore] = None,
        config: Optional[RAGConfig] = None,
    ):
        self.config = config or RAGConfig()
        self.embedder = embedder or DenseVectorEmbeddingProvider(dimension=self.config.embedding_dim)
        self.vector_store = vector_store or PersistentVectorStore()
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

        # 2. Similarity Vector Search
        t1 = time.perf_counter()
        retrieved_chunks = self.vector_store.search(
            query_vector=query_vector,
            top_k=top_k,
            threshold=self.config.similarity_threshold,
        )
        retrieval_latency = (time.perf_counter() - t1) * 1000.0

        # 3. Assemble Prompt Context
        prompt = self.prompt_builder.build_prompt(
            question=request.question,
            retrieved_chunks=retrieved_chunks,
            user_profile=request.user_profile,
        )

        # 4. Generate Answer (Grounded Synthesis)
        answer = self._generate_grounded_answer(request.question, retrieved_chunks)

        # 5. Extract Citations
        citations = self.citation_engine.generate_citations(retrieved_chunks)
        if request.include_citations and citations:
            answer += self.citation_engine.format_citations_markdown(citations)

        total_latency = (time.perf_counter() - start_time) * 1000.0

        metrics = {
            "embedding_latency_ms": round(embedding_latency, 2),
            "retrieval_latency_ms": round(retrieval_latency, 2),
            "total_latency_ms": round(total_latency, 2),
            "chunks_retrieved": len(retrieved_chunks),
            "top_score": retrieved_chunks[0].score if retrieved_chunks else 0.0,
        }

        return RAGQueryResponse(
            answer=answer,
            citations=citations,
            retrieved_chunks=retrieved_chunks,
            metrics=metrics,
            grounded=len(retrieved_chunks) > 0,
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
