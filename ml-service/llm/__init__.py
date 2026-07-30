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

from llm.dataset.pipeline import FinancialDatasetPipeline
from llm.dataset.cleaner import clean_text
from llm.dataset.formatter import format_sample_to_text
from llm.dataset.loader import load_dataset_file, save_dataset_file

from llm.training.trainer import LoRATrainingPlatform
from llm.training.schema import FineTuningConfig, LoRAConfigSchema, FineTuningReport

from llm.evaluation.evaluator import LLMEvaluator
from llm.evaluation.metrics import (
    compute_perplexity,
    compute_bleu,
    compute_rouge,
    compute_bertscore_approx,
    compute_grounding_faithfulness,
)

from llm.inference.conversation import ConversationHistory
from llm.inference.tools import ToolCallingEngine, ToolCallResult
from llm.inference.rag_integration import RAGLLMPipeline
from llm.schema import ChatMessage

__version__ = "3.5.0"

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
    "ChatMessage",
    "FinancialDatasetPipeline",
    "clean_text",
    "format_sample_to_text",
    "load_dataset_file",
    "save_dataset_file",
    "LoRATrainingPlatform",
    "FineTuningConfig",
    "LoRAConfigSchema",
    "FineTuningReport",
    "LLMEvaluator",
    "compute_perplexity",
    "compute_bleu",
    "compute_rouge",
    "compute_bertscore_approx",
    "compute_grounding_faithfulness",
    "ConversationHistory",
    "ToolCallingEngine",
    "ToolCallResult",
    "RAGLLMPipeline",
]
