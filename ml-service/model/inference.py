"""
WealthGenie ML Microservice - Concrete Model Predictor Implementations
Implements BasePredictor interface for RandomForest, PyTorch MLP, and FT-Transformer models.
"""

import json
import logging
import time
from pathlib import Path
from typing import Dict, List, Any, Optional

import joblib
import numpy as np
import torch

from model.base import BasePredictor
from model.config import ArtifactPaths, PyTorchModelConfig, get_device
from model.ft_transformer import FTTransformer, FTTransformerConfig
from model.model import FinancialMLP
from model.preprocessing import FeaturePreprocessor

logger = logging.getLogger("wealthgenie.inference")


class RandomForestPredictor(BasePredictor):
    """Predictor wrapping trained Scikit-Learn RandomForest classifier."""

    def __init__(self, model_path: Path = None, label_encoder_path: Path = None):
        self.model_path = model_path or (Path(__file__).resolve().parent / "model.pkl")
        self.label_encoder_path = label_encoder_path or (Path(__file__).resolve().parent / "label_encoder.pkl")
        self.model = None
        self.label_encoder = None
        self._is_loaded = False

    def load_artifacts(self) -> None:
        """Loads RandomForest pkl and label encoder from disk."""
        if not self.model_path.exists() or not self.label_encoder_path.exists():
            logger.warning(f"RandomForest artifacts missing at {self.model_path}")
            return
        self.model = joblib.load(self.model_path)
        self.label_encoder = joblib.load(self.label_encoder_path)
        self._is_loaded = True
        logger.info("RandomForestPredictor loaded successfully.")

    def predict_proba(self, feature_array: np.ndarray) -> np.ndarray:
        if not self._is_loaded or self.model is None:
            raise RuntimeError("RandomForestPredictor not loaded.")
        return self.model.predict_proba(feature_array)

    def predict(self, feature_array: np.ndarray) -> Dict[str, Any]:
        start_time = time.perf_counter()
        proba = self.predict_proba(feature_array)[0]
        latency_ms = (time.perf_counter() - start_time) * 1000.0

        sorted_idx = np.argsort(proba)[::-1]
        confidence_scores = {
            self.TARGET_CLASSES[i]: round(float(proba[i]), 4)
            for i in range(len(self.TARGET_CLASSES))
        }

        return {
            "model_used": self.model_name,
            "primary": self.TARGET_CLASSES[sorted_idx[0]],
            "secondary": self.TARGET_CLASSES[sorted_idx[1]],
            "tertiary": self.TARGET_CLASSES[sorted_idx[2]],
            "confidence_scores": confidence_scores,
            "primary_confidence": round(float(proba[sorted_idx[0]]), 4),
            "low_confidence": float(proba[sorted_idx[0]]) < 0.45,
            "latency_ms": round(latency_ms, 3),
        }

    @property
    def model_name(self) -> str:
        return "RandomForest"

    @property
    def is_loaded(self) -> bool:
        return self._is_loaded


class MLPPredictor(BasePredictor):
    """Predictor wrapping trained PyTorch Multi-Layer Perceptron (MLP) model."""

    def __init__(self, paths: ArtifactPaths = ArtifactPaths()):
        self.paths = paths
        self.device = get_device()
        self.preprocessor = FeaturePreprocessor()
        self.model: Optional[FinancialMLP] = None
        self._is_loaded = False

    def load_artifacts(self) -> None:
        """Loads PyTorch model weights and scaler from disk."""
        if not self.paths.model_weights.exists() or not self.paths.scaler_path.exists():
            logger.warning(f"MLPPredictor weights missing at {self.paths.model_weights}")
            return

        self.preprocessor.load(self.paths.scaler_path)

        metadata = {}
        if self.paths.metadata_path.exists():
            with open(self.paths.metadata_path, "r", encoding="utf-8") as f:
                metadata = json.load(f)

        model_config = metadata.get("model_config", {})
        config = PyTorchModelConfig(**model_config) if model_config else PyTorchModelConfig()

        self.model = FinancialMLP(config).to(self.device)
        self.model.load_state_dict(torch.load(self.paths.model_weights, map_location=self.device))
        self.model.eval()
        self._is_loaded = True
        logger.info(f"MLPPredictor loaded successfully on {self.device}.")

    def predict_proba(self, feature_array: np.ndarray) -> np.ndarray:
        if not self._is_loaded or self.model is None:
            raise RuntimeError("MLPPredictor not loaded.")
        X_tensor = self.preprocessor.transform_to_tensor(feature_array, self.device)
        with torch.no_grad():
            return self.model.predict_proba(X_tensor).cpu().numpy()

    def predict(self, feature_array: np.ndarray) -> Dict[str, Any]:
        start_time = time.perf_counter()
        proba = self.predict_proba(feature_array)[0]
        latency_ms = (time.perf_counter() - start_time) * 1000.0

        sorted_idx = np.argsort(proba)[::-1]
        confidence_scores = {
            self.TARGET_CLASSES[i]: round(float(proba[i]), 4)
            for i in range(len(self.TARGET_CLASSES))
        }

        return {
            "model_used": self.model_name,
            "primary": self.TARGET_CLASSES[sorted_idx[0]],
            "secondary": self.TARGET_CLASSES[sorted_idx[1]],
            "tertiary": self.TARGET_CLASSES[sorted_idx[2]],
            "confidence_scores": confidence_scores,
            "primary_confidence": round(float(proba[sorted_idx[0]]), 4),
            "low_confidence": float(proba[sorted_idx[0]]) < 0.45,
            "latency_ms": round(latency_ms, 3),
        }

    @property
    def model_name(self) -> str:
        return "PyTorch_FinancialMLP"

    @property
    def is_loaded(self) -> bool:
        return self._is_loaded


class FTTransformerPredictor(BasePredictor):
    """Predictor wrapping trained PyTorch FT-Transformer model."""

    def __init__(self, weights_path: Path = None, scaler_path: Path = None):
        base_dir = Path(__file__).resolve().parent / "saved_models"
        self.weights_path = weights_path or (base_dir / "ft_transformer.pt")
        self.scaler_path = scaler_path or (base_dir / "scaler.pkl")
        self.device = get_device()
        self.preprocessor = FeaturePreprocessor()
        self.model: Optional[FTTransformer] = None
        self._is_loaded = False

    def load_artifacts(self) -> None:
        """Loads FT-Transformer weights and preprocessor."""
        if not self.weights_path.exists() or not self.scaler_path.exists():
            logger.warning(f"FTTransformerPredictor weights missing at {self.weights_path}")
            return

        self.preprocessor.load(self.scaler_path)
        config = FTTransformerConfig()
        self.model = FTTransformer(config).to(self.device)
        self.model.load_state_dict(torch.load(self.weights_path, map_location=self.device))
        self.model.eval()
        self._is_loaded = True
        logger.info(f"FTTransformerPredictor loaded successfully on {self.device}.")

    def predict_proba(self, feature_array: np.ndarray) -> np.ndarray:
        if not self._is_loaded or self.model is None:
            raise RuntimeError("FTTransformerPredictor not loaded.")
        X_tensor = self.preprocessor.transform_to_tensor(feature_array, self.device)
        with torch.no_grad():
            return self.model.predict_proba(X_tensor).cpu().numpy()

    def predict(self, feature_array: np.ndarray) -> Dict[str, Any]:
        start_time = time.perf_counter()
        proba = self.predict_proba(feature_array)[0]
        latency_ms = (time.perf_counter() - start_time) * 1000.0

        sorted_idx = np.argsort(proba)[::-1]
        confidence_scores = {
            self.TARGET_CLASSES[i]: round(float(proba[i]), 4)
            for i in range(len(self.TARGET_CLASSES))
        }

        return {
            "model_used": self.model_name,
            "primary": self.TARGET_CLASSES[sorted_idx[0]],
            "secondary": self.TARGET_CLASSES[sorted_idx[1]],
            "tertiary": self.TARGET_CLASSES[sorted_idx[2]],
            "confidence_scores": confidence_scores,
            "primary_confidence": round(float(proba[sorted_idx[0]]), 4),
            "low_confidence": float(proba[sorted_idx[0]]) < 0.45,
            "latency_ms": round(latency_ms, 3),
        }

    @property
    def model_name(self) -> str:
        return "PyTorch_FTTransformer"

    @property
    def is_loaded(self) -> bool:
        return self._is_loaded


# Alias for backward compatibility
PyTorchInferenceEngine = MLPPredictor
