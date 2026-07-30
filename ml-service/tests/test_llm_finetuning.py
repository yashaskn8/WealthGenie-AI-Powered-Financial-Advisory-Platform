"""
WealthGenie Production Open-Weight LLM Platform - Fine-Tuning Test Suite (Phase 3.3)
Tests LoRA/QLoRA configuration, training pipeline execution, adapter saving, and report export.
"""

import json
import pytest
from pathlib import Path
from llm.training.schema import FineTuningConfig, LoRAConfigSchema
from llm.training.trainer import LoRATrainingPlatform


def test_lora_config_schema():
    lora_cfg = LoRAConfigSchema(r=16, lora_alpha=32, lora_dropout=0.1)
    assert lora_cfg.r == 16
    assert lora_cfg.lora_alpha == 32
    assert "q_proj" in lora_cfg.target_modules


def test_finetuning_config_defaults():
    cfg = FineTuningConfig(base_model_id="Qwen/Qwen2.5-0.5B-Instruct")
    assert cfg.base_model_id == "Qwen/Qwen2.5-0.5B-Instruct"
    assert cfg.use_qlora
    assert cfg.learning_rate == 2e-4


def test_lora_training_platform_execution(tmp_path):
    output_dir = tmp_path / "adapters"
    cfg = FineTuningConfig(
        base_model_id="Qwen/Qwen2.5-0.5B-Instruct",
        output_dir=str(output_dir),
        max_steps=10,
    )
    platform = LoRATrainingPlatform(config=cfg)

    dataset_file = tmp_path / "train.jsonl"
    dataset_file.write_text('{"instruction": "Tax query", "output": "Tax answer"}\n', encoding="utf-8")

    report = platform.train(train_dataset_path=dataset_file)

    assert report.total_steps == 10
    assert report.final_loss > 0.0
    assert report.training_duration_seconds >= 0.0
    assert len(report.metrics_history) == 10

    assert (output_dir / "adapter_config.json").exists()
    assert (output_dir / "adapter_model.safetensors").exists()
    assert (output_dir / "training_report.json").exists()

    report_json = json.loads((output_dir / "training_report.json").read_text(encoding="utf-8"))
    assert report_json["total_steps"] == 10
