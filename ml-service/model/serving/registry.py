"""
WealthGenie ML Microservice - Modular Model Registry
Centralized registry for dynamic model registration, lookup, and unified multi-model inference execution.
"""

import logging
from typing import Dict, List, Any, Optional, Type
from model.architecture.base import BasePredictor

logger = logging.getLogger("wealthgenie.model_registry")


class ModelRegistry:
    """Singleton-style registry managing model predictors and their lifecycles."""

    def __init__(self):
        self._registry: Dict[str, BasePredictor] = {}

    def register(self, name: str, predictor: BasePredictor) -> None:
        """Registers a model predictor instance under a unique identifier key."""
        key = name.lower().strip()
        self._registry[key] = predictor
        logger.info(f"Registered model predictor '{name}' in ModelRegistry.")

    def get(self, name: str) -> Optional[BasePredictor]:
        """Retrieves a registered model predictor by key."""
        key = name.lower().strip()
        return self._registry.get(key)

    def list_models(self) -> List[Dict[str, Any]]:
        """Returns metadata for all currently registered models."""
        models_info = []
        for key, predictor in self._registry.items():
            models_info.append({
                "key": key,
                "model_name": predictor.model_name,
                "is_loaded": predictor.is_loaded,
            })
        return models_info

    def get_loaded_predictors(self) -> Dict[str, BasePredictor]:
        """Returns a dict of all currently loaded predictors."""
        return {key: pred for key, pred in self._registry.items() if pred.is_loaded}


# Global singleton registry instance
registry = ModelRegistry()
