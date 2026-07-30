"""
WealthGenie Open-Weight LLM Platform - Dataset Pipeline Schemas
Defines schemas for instruction data, chat conversations, dataset statistics, and quality reports.
"""

from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field


class InstructionSample(BaseModel):
    """Single instruction-following sample."""
    instruction: str = Field(..., description="Task instruction prompt")
    input: str = Field("", description="Optional contextual input")
    output: str = Field(..., description="Target completion answer")
    system: Optional[str] = Field(None, description="Optional system instruction")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Metadata key-values")


class ChatMessage(BaseModel):
    """Single turn message in a multi-turn conversation."""
    role: str = Field(..., description="Message role (system, user, assistant)")
    content: str = Field(..., description="Message content body")


class ConversationSample(BaseModel):
    """Multi-turn conversation dataset sample."""
    messages: List[ChatMessage] = Field(..., description="Sequence of conversation turns")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Sample metadata")


class DatasetStats(BaseModel):
    """Statistical summary of a processed dataset split."""
    total_samples: int = Field(..., description="Total number of samples")
    total_tokens_approx: int = Field(..., description="Estimated total token count")
    avg_tokens_per_sample: float = Field(..., description="Average token count per sample")
    min_tokens: int = Field(..., description="Minimum token count in samples")
    max_tokens: int = Field(..., description="Maximum token count in samples")
    vocabulary_size_approx: int = Field(..., description="Approximate unique vocabulary word count")


class QualityReport(BaseModel):
    """Data quality and cleaning audit report."""
    raw_samples_count: int = Field(..., description="Initial raw sample count")
    invalid_samples_removed: int = Field(..., description="Number of invalid/malformed samples removed")
    duplicates_removed: int = Field(..., description="Number of duplicate samples removed")
    clean_samples_count: int = Field(..., description="Final clean sample count")
    split_distribution: Dict[str, int] = Field(..., description="Sample count breakdown per split (train/val/test)")
    stats: DatasetStats = Field(..., description="Overall clean dataset statistics")
