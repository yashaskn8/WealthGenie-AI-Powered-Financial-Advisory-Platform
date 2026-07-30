"""
WealthGenie Open-Weight LLM Platform - End-to-End RAG + LLM Orchestrator
Combines hybrid vector retrieval, prompt security, and open-weight LLM synthesis with automatic API fallback.
"""

import logging
import time
from typing import Dict, Any, List, Optional

from llm.registry import LLMModelRegistry, llm_registry
from llm.schema import LLMGenerateRequest, LLMGenerateResponse
from rag.retrieval.pipeline import RAGPipeline
from rag.schema import RAGQueryRequest, RAGQueryResponse

logger = logging.getLogger("wealthgenie.llm.rag_integration")


class RAGLLMPipeline:
    """Orchestrates end-to-end RAG retrieval combined with Open-Weight LLM synthesis."""

    def __init__(
        self,
        rag_pipeline: Optional[RAGPipeline] = None,
        model_registry: Optional[LLMModelRegistry] = None,
    ):
        self.rag_pipeline = rag_pipeline or RAGPipeline()
        self.model_registry = model_registry or llm_registry

    def query(self, request: RAGQueryRequest) -> RAGQueryResponse:
        """
        Executes hybrid RAG retrieval, passes evidence context to the active LLM, and returns grounded response.
        If local LLM generation encounters an error, automatically falls back to API provider.
        """
        t0 = time.perf_counter()

        # 1. Execute RAG retrieval
        rag_response = self.rag_pipeline.query(request)

        if not rag_response.retrieved_chunks:
            return rag_response

        # 2. Construct LLM prompt with retrieved evidence context
        context_text = "\n\n".join(
            f"--- Document: {c.chunk.metadata.title} ---\n{c.chunk.content}"
            for c in rag_response.retrieved_chunks
        )

        system_instruction = (
            "You are WealthGenie AI, a certified financial advisor. "
            "Synthesize an advisory answer strictly grounded in the provided document evidence below. "
            "Cite sources clearly using [1], [2] format."
        )

        user_prompt = f"Evidence Context:\n{context_text}\n\nUser Question: {request.question}"

        llm_req = LLMGenerateRequest(
            prompt=user_prompt,
            system_prompt=system_instruction,
            max_new_tokens=512,
            temperature=0.3,
            tenant_id=request.tenant_id,
        )

        # 3. LLM Generation with API Fallback
        try:
            active_provider = self.model_registry.get_active_provider()
            llm_res = active_provider.generate(llm_req)
        except Exception as e:
            logger.warning(f"Active LLM provider generation failed ({e}). Falling back to API provider...")
            from llm.providers.api_provider import APILLMProvider
            fallback_provider = APILLMProvider()
            llm_res = fallback_provider.generate(llm_req)

        # 4. Update response with LLM synthesized text
        rag_response.answer = llm_res.text
        rag_response.metrics["llm_latency_ms"] = llm_res.latency_ms
        rag_response.metrics["llm_provider"] = llm_res.provider
        rag_response.metrics["llm_model"] = llm_res.model_name
        rag_response.metrics["total_latency_ms"] = round((time.perf_counter() - t0) * 1000.0, 2)

        return rag_response
