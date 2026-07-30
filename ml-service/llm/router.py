"""
WealthGenie Open-Weight LLM Platform - FastAPI Router
Exposes dedicated endpoints (/llm/generate, /llm/rag-query, /llm/batch-generate, /llm/tool-query, /llm/models, /llm/switch, /llm/status, /llm/health).
"""

import logging
from typing import Dict, Any, List
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from llm.config import LLMConfig
from llm.inference.rag_integration import RAGLLMPipeline
from llm.inference.tools import ToolCallingEngine
from llm.registry import llm_registry
from llm.schema import LLMGenerateRequest, LLMGenerateResponse, LLMMetadata
from rag.schema import RAGQueryRequest, RAGQueryResponse

logger = logging.getLogger("wealthgenie.llm.router")

llm_router = APIRouter(prefix="/llm", tags=["Open-Weight LLM Platform"])
llm_config = LLMConfig()
tool_engine = ToolCallingEngine()
rag_llm_pipeline = RAGLLMPipeline(model_registry=llm_registry)


class SwitchModelRequest(BaseModel):
    provider_key: str = Field(..., description="Provider key to activate (e.g. mock, huggingface, api, local)")


class ToolQueryRequest(BaseModel):
    tool_name: str = Field(..., description="Name of financial tool to execute (calculate_sip, calculate_cagr, calculate_tax_rebate)")
    arguments: Dict[str, Any] = Field(..., description="Tool input parameters")


@llm_router.get("/health")
def llm_health():
    """Health check endpoint for the LLM infrastructure."""
    active_provider = llm_registry.get_active_provider()
    is_healthy = active_provider.is_healthy()
    meta = active_provider.get_metadata()
    return {
        "status": "ok" if is_healthy else "degraded",
        "service": "WealthGenie Open-Weight LLM Platform",
        "active_model": meta.model_name,
        "provider": meta.provider.value,
        "device": meta.device,
    }


@llm_router.get("/status")
def llm_status():
    """Returns runtime execution metrics, device bindings, and quantization options."""
    active_provider = llm_registry.get_active_provider()
    meta = active_provider.get_metadata()
    return {
        "active_model_metadata": meta.model_dump(),
        "registered_models_count": len(llm_registry.list_models()),
        "configured_device": llm_config.device,
        "configured_quantization": llm_config.quantization,
        "default_max_new_tokens": llm_config.max_new_tokens,
    }


@llm_router.get("/models")
def list_models():
    """Lists all registered LLM providers and their metadata summaries."""
    return {"models": llm_registry.list_models()}


@llm_router.post("/generate", response_model=LLMGenerateResponse)
def generate_text(request: LLMGenerateRequest):
    """
    Generates text using the currently active Open-Weight LLM provider.
    Returns generated text, token counts, and execution latency.
    """
    try:
        provider = llm_registry.get_active_provider()
        return provider.generate(request)
    except Exception as e:
        logger.error(f"LLM generation failed: {e}")
        raise HTTPException(status_code=500, detail=f"LLM generation error: {str(e)}")


@llm_router.post("/batch-generate")
def batch_generate(requests: List[LLMGenerateRequest]):
    """Runs batch inference generation across multiple LLM requests."""
    try:
        provider = llm_registry.get_active_provider()
        responses = [provider.generate(req) for req in requests]
        return {"batch_count": len(responses), "responses": [r.model_dump() for r in responses]}
    except Exception as e:
        logger.error(f"Batch generation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Batch generation error: {str(e)}")


@llm_router.post("/rag-query", response_model=RAGQueryResponse)
def rag_llm_query(request: RAGQueryRequest):
    """Executes hybrid RAG retrieval combined with Open-Weight LLM answer synthesis."""
    try:
        return rag_llm_pipeline.query(request)
    except Exception as e:
        logger.error(f"RAG LLM query failed: {e}")
        raise HTTPException(status_code=500, detail=f"RAG LLM query error: {str(e)}")


@llm_router.post("/tool-query")
def tool_query(request: ToolQueryRequest):
    """Executes financial calculator tools (calculate_sip, calculate_cagr, calculate_tax_rebate)."""
    res = tool_engine.execute_tool(request.tool_name, request.arguments)
    if not res.success:
        raise HTTPException(status_code=400, detail=res.result.get("error", "Tool execution failed"))
    return res.model_dump()


@llm_router.get("/tools")
def list_financial_tools():
    """Lists registered financial calculator tools."""
    return {"tools": tool_engine.list_tools()}


@llm_router.post("/switch")
def switch_model(request: SwitchModelRequest):
    """Switches the active LLM provider dynamically at runtime."""
    success = llm_registry.set_active_provider(request.provider_key)
    if not success:
        raise HTTPException(status_code=400, detail=f"Failed to activate provider '{request.provider_key}'.")
    active_meta = llm_registry.get_active_provider().get_metadata()
    return {
        "status": "success",
        "message": f"Active LLM provider switched to '{request.provider_key}'.",
        "active_model": active_meta.model_name,
    }
