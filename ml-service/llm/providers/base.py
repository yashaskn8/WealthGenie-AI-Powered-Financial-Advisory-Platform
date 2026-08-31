"""
WealthGenie Open-Weight LLM Platform - Base Provider Interface
Defines the standard abstract contract for all LLM providers (Hugging Face, Local, API, Mock).
"""

from abc import ABC, abstractmethod
from typing import Generator
from llm.schema import LLMGenerateRequest, LLMGenerateResponse, LLMMetadata


class BaseLLMProvider(ABC):
    """Abstract interface that all LLM execution backends must implement."""

    @abstractmethod
    def generate(self, request: LLMGenerateRequest) -> LLMGenerateResponse:
        """Executes text generation synchronously and returns a structured LLMGenerateResponse."""
        pass

    @abstractmethod
    def generate_stream(self, request: LLMGenerateRequest) -> Generator[str, None, None]:
        """Streams generated text tokens yields iteratively."""
        pass

    @abstractmethod
    def get_metadata(self) -> LLMMetadata:
        """Returns metadata describing the active model name, device, quantization, and version."""
        pass

    @abstractmethod
    def is_healthy(self) -> bool:
        """Checks provider operational health and model readiness."""
        pass
