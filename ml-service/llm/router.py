"""
WealthGenie Open-Weight LLM Platform - FastAPI Router
Exposes dedicated endpoints (/llm/generate, /llm/models, /llm/switch, /llm/status, /llm/health).
"""

import logging
from typing import Dict, Any, List
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from llm.config import LLMConfig
from llm.registry import llm_registry
from llm.schema import LLMGenerateRequest, LLMGenerateResponse, LLMMetadata

logger = logging.getLogger("wealthgenie.llm.router")

llm_router = APIRouter(prefix="/llm", tags=["Open-Weight LLM Platform"])
llm_config = LLMConfig()


class SwitchModelRequest(BaseModel):
    provider_key: str = Field(..., description="Provider key to activate (e.g. mock, huggingface, api, local)")


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
