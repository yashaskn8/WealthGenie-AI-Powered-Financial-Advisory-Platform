"""
WealthGenie Open-Weight LLM Platform - Fine-Tuning Callbacks
Provides custom Hugging Face Trainer callbacks for metrics tracking and loss trajectory logging.
"""

import logging
from typing import Dict, Any, List
from llm.training.schema import TrainingMetricsStep

logger = logging.getLogger("wealthgenie.llm.training.callbacks")


class MetricsTrackingCallback:
    """Tracks training loss, learning rate, and step progression during fine-tuning."""

    def __init__(self):
        self.history: List[TrainingMetricsStep] = []

    def on_log(self, args: Any, state: Any, control: Any, logs: Dict[str, Any] = None, **kwargs) -> None:
        """Called whenever Trainer logs metrics."""
        if logs and "loss" in logs:
            step = state.global_step
            loss = float(logs.get("loss", 0.0))
            lr = float(logs.get("learning_rate", 0.0))
            epoch = float(state.epoch or 0.0)

            metric_entry = TrainingMetricsStep(
                step=step,
                loss=round(loss, 4),
                learning_rate=lr,
                epoch=round(epoch, 2),
            )
            self.history.append(metric_entry)
            logger.info(f"Training Step {step}: Loss = {loss:.4f}, LR = {lr:.6e}, Epoch = {epoch:.2f}")
