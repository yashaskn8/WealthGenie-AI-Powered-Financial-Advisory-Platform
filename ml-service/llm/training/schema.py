"""
WealthGenie Open-Weight LLM Platform - Fine-Tuning Schemas
Defines configuration objects for LoRA/QLoRA parameters, training hyperparameters, and training audit reports.
"""

from typing import Dict, Any, List, Optional
from pydantic import BaseModel, ConfigDict, Field


class LoRAConfigSchema(BaseModel):
    """Configuration for Parameter-Efficient Fine-Tuning (LoRA / QLoRA)."""
    model_config = ConfigDict(protected_namespaces=())
    r: int = Field(8, ge=1, le=256, description="LoRA rank dimension")
    lora_alpha: int = Field(16, ge=1, le=512, description="LoRA scaling alpha factor")
    lora_dropout: float = Field(0.05, ge=0.0, le=0.5, description="Dropout probability for LoRA layers")
    target_modules: List[str] = Field(
        default_factory=lambda: ["q_proj", "v_proj", "k_proj", "o_proj"],
        description="List of target module names to attach LoRA adapters",
    )
    bias: str = Field("none", description="Bias parameter training setting (none, all, lora_only)")
    task_type: str = Field("CAUSAL_LM", description="PEFT task type")


class FineTuningConfig(BaseModel):
    """Hyperparameters and settings for LoRA / QLoRA training run."""
    model_config = ConfigDict(protected_namespaces=())
    base_model_id: str = Field("Qwen/Qwen2.5-0.5B-Instruct", description="Base model name or path")
    output_dir: str = Field("reports/llm_store/adapters", description="Output directory for saved LoRA adapters")
    learning_rate: float = Field(2e-4, ge=1e-6, le=1e-2, description="Learning rate for AdamW optimizer")
    per_device_train_batch_size: int = Field(2, ge=1, description="Per-device training batch size")
    gradient_accumulation_steps: int = Field(4, ge=1, description="Gradient accumulation steps")
    num_train_epochs: float = Field(3.0, ge=0.1, description="Total training epochs")
    max_steps: int = Field(-1, description="Maximum training steps (-1 for full epoch training)")
    warmup_ratio: float = Field(0.03, ge=0.0, le=0.5, description="Warmup ratio for learning rate scheduler")
    logging_steps: int = Field(10, ge=1, description="Logging frequency in steps")
    save_steps: int = Field(50, ge=1, description="Checkpoint saving frequency in steps")
    fp16: bool = Field(True, description="Enable FP16 mixed precision training")
    bf16: bool = Field(False, description="Enable BF16 mixed precision training")
    use_qlora: bool = Field(True, description="Enable 4-bit QLoRA quantization via bitsandbytes")
    gradient_checkpointing: bool = Field(True, description="Enable gradient checkpointing to save GPU VRAM")
    lora: LoRAConfigSchema = Field(default_factory=LoRAConfigSchema, description="LoRA adapter configuration")


class TrainingMetricsStep(BaseModel):
    """Metrics snapshot recorded at a training step."""
    step: int = Field(..., description="Global step number")
    loss: float = Field(..., description="Training loss at step")
    learning_rate: float = Field(..., description="Active learning rate")
    epoch: float = Field(..., description="Active epoch count")


class FineTuningReport(BaseModel):
    """Final audit report summarizing a fine-tuning experiment run."""
    model_config = ConfigDict(protected_namespaces=())
    base_model_id: str = Field(..., description="Base model identifier")
    adapter_output_dir: str = Field(..., description="Directory where adapter weights were saved")
    total_steps: int = Field(..., description="Total global steps completed")
    final_loss: float = Field(..., description="Final recorded training loss")
    training_duration_seconds: float = Field(..., description="Total wall-clock training duration in seconds")
    used_qlora: bool = Field(..., description="Whether 4-bit QLoRA was used")
    metrics_history: List[TrainingMetricsStep] = Field(default_factory=list, description="Step loss trajectory history")
