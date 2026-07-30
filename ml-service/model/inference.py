"""
WealthGenie ML Microservice - PyTorch Inference Engine
Provides high-performance inference for single and batch feature vectors using the trained PyTorch model.
"""

import json
import logging
import time
from pathlib import Path
from typing import Dict, List, Any, Optional

import numpy as np
import torch

from model.config import ArtifactPaths, PyTorchModelConfig, get_device
from model.model import FinancialMLP
from model.preprocessing import FeaturePreprocessor

logger = logging.getLogger("wealthgenie.pytorch_inference")


class PyTorchInferenceEngine:
    """Production inference engine for serving PyTorch suitability predictions."""

    TARGET_CLASSES = ["Equity_MF", "ELSS", "ETF", "Debt_MF", "FD", "RBI_Bond"]

    def __init__(self, paths: ArtifactPaths = ArtifactPaths()):
        self.paths = paths
        self.device = get_device()
        self.preprocessor = FeaturePreprocessor()
        self.model: Optional[FinancialMLP] = None
        self.metadata: Dict[str, Any] = {}
        self.is_loaded = False

    def load_artifacts(self) -> None:
        """Loads trained weights, scaler artifact, and metadata from disk."""
        if not self.paths.model_weights.exists():
            logger.warning(f"PyTorch weights not found at {self.paths.model_weights}. Model needs training.")
            return

        # 1. Load Preprocessor
        self.preprocessor.load(self.paths.scaler_path)

        # 2. Load Metadata
        if self.paths.metadata_path.exists():
            with open(self.paths.metadata_path, "r", encoding="utf-8") as f:
                self.metadata = json.load(f)

        # 3. Instantiate and load Model
        model_config_dict = self.metadata.get("model_config", {})
        config = PyTorchModelConfig(**model_config_dict) if model_config_dict else PyTorchModelConfig()

        self.model = FinancialMLP(config).to(self.device)
        self.model.load_state_dict(torch.load(self.paths.model_weights, map_location=self.device))
        self.model.eval()
        self.is_loaded = True
        logger.info(f"Successfully loaded PyTorch model onto {self.device}")

    def predict(self, feature_array: np.ndarray) -> Dict[str, Any]:
        """
        Runs inference on a (1, 16) or (N, 16) feature matrix.
        Returns target class rankings, confidence scores, and latency.
        """
        if not self.is_loaded or self.model is None:
            raise RuntimeError("PyTorchInferenceEngine artifacts are not loaded. Train or load the model first.")

        start_time = time.perf_counter()

        # Scale features and convert to tensor
        X_tensor = self.preprocessor.transform_to_tensor(feature_array, self.device)

        with torch.no_grad():
            probabilities = self.model.predict_proba(X_tensor).cpu().numpy()[0]

        latency_ms = (time.perf_counter() - start_time) * 1000.0

        # Sort classes by descending probability
        sorted_indices = np.argsort(probabilities)[::-1]
        confidence_scores = {
            self.TARGET_CLASSES[idx]: round(float(probabilities[idx]), 4)
            for idx in range(len(self.TARGET_CLASSES))
        }

        primary = self.TARGET_CLASSES[sorted_indices[0]]
        secondary = self.TARGET_CLASSES[sorted_indices[1]]
        tertiary = self.TARGET_CLASSES[sorted_indices[2]]
        primary_confidence = float(probabilities[sorted_indices[0]])

        return {
            "model_used": "PyTorch_FinancialMLP",
            "primary": primary,
            "secondary": secondary,
            "tertiary": tertiary,
            "confidence_scores": confidence_scores,
            "primary_confidence": round(primary_confidence, 4),
            "low_confidence": primary_confidence < 0.45,
            "latency_ms": round(latency_ms, 3),
            "model_version": self.metadata.get("version", "1.0.0"),
        }
