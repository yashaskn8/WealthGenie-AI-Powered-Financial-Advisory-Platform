"""
WealthGenie Production Open-Weight LLM Platform Package.
Exports core providers, registry, configuration, and request/response schemas.
"""

from llm.config import LLMConfig
from llm.providers.base import BaseLLMProvider
from llm.providers.huggingface_provider import HuggingFaceLLMProvider
from llm.providers.mock_provider import MockLLMProvider
from llm.providers.api_provider import APILLMProvider
from llm.providers.local_loader import LocalLLMLoader
from llm.registry import LLMModelRegistry, llm_registry
from llm.schema import (
    LLMGenerateRequest,
    LLMGenerateResponse,
    LLMMetadata,
    LLMProviderType,
    QuantizationType,
)

__version__ = "3.1.0"

__all__ = [
    "LLMConfig",
    "BaseLLMProvider",
    "HuggingFaceLLMProvider",
    "MockLLMProvider",
    "APILLMProvider",
    "LocalLLMLoader",
    "LLMModelRegistry",
    "llm_registry",
    "LLMGenerateRequest",
    "LLMGenerateResponse",
    "LLMMetadata",
    "LLMProviderType",
    "QuantizationType",
]
