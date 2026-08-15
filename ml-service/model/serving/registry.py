"""
WealthGenie ML Microservice - Modular Model Registry
Centralized registry for dynamic model registration, lookup, and unified multi-model inference execution.
Integrates in-memory inference predictors with persistent version registries (MongoDB / SQLite) via store_factory.
"""

import logging
from pathlib import Path
from typing import Dict, List, Any, Optional
from model.architecture.base import BasePredictor

logger = logging.getLogger("wealthgenie.model_registry")


class ModelRegistry:
    """Registry managing in-memory model predictors and bridging to persistent version registry."""

    def __init__(self, version_registry=None):
        self._registry: Dict[str, BasePredictor] = {}
        self._version_registry = version_registry

    def set_version_registry(self, version_registry) -> None:
        """Attaches the persistent version registry store."""
        self._version_registry = version_registry
        logger.info(f"Attached version registry ({type(version_registry).__name__}) to ModelRegistry.")

    def get_version_registry(self):
        """Returns the persistent version registry store if attached."""
        return self._version_registry

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
        """Returns metadata for all currently registered in-memory models."""
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

    def list_versions(self, architecture: Optional[str] = None) -> List[Dict[str, Any]]:
        """Queries persistent version registry for all registered model versions."""
        if self._version_registry is None:
            return []
        return self._version_registry.list_versions(architecture)

    def get_active_model(self, architecture: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Queries persistent version registry for the active model version."""
        if self._version_registry is None:
            return None
        return self._version_registry.get_active_model(architecture)

    def reload_active_model(self, architecture: str) -> Optional[BasePredictor]:
        """
        Resolves the active model version for `architecture` from the persistent
        version registry, verifies artifact hash integrity, and reloads the
        corresponding in-memory predictor.
        """
        if self._version_registry is None:
            logger.warning("Cannot reload active model: no version registry attached.")
            return None

        # Canonicalize architecture names
        arch_map = {
            "randomforest": ("RandomForest", "random_forest"),
            "random_forest": ("RandomForest", "random_forest"),
            "rf": ("RandomForest", "random_forest"),
            "mlp": ("PyTorch_MLP", "mlp"),
            "pytorch": ("PyTorch_MLP", "mlp"),
            "pytorch_mlp": ("PyTorch_MLP", "mlp"),
            "ft_transformer": ("FT_Transformer", "ft_transformer"),
            "fttransformer": ("FT_Transformer", "ft_transformer"),
            "ft-transformer": ("FT_Transformer", "ft_transformer"),
        }

        arch_norm = architecture.lower().strip()
        reg_arch, pred_key = arch_map.get(arch_norm, (architecture, arch_norm))

        active_version = self._version_registry.get_active_model(reg_arch)
        if not active_version:
            active_version = self._version_registry.get_active_model(architecture)

        if not active_version:
            logger.warning(f"No active version found in registry for architecture '{architecture}'.")
            return None

        artifact_path = Path(active_version["artifact_path"])
        if not artifact_path.exists():
            logger.error(f"Active version {active_version['version_id']} artifact missing at {artifact_path}")
            return None

        # Integrity check
        integrity = self._version_registry.verify_artifact_integrity(active_version["version_id"])
        if integrity.get("integrity") == "TAMPERED":
            logger.error(f"TAMPER DETECTED for active version {active_version['version_id']}. Reload aborted.")
            return None

        # Reload predictor instance
        predictor = self.get(pred_key)
        if predictor is not None:
            if hasattr(predictor, "load_artifacts"):
                predictor.load_artifacts(artifact_path=artifact_path)
            logger.info(f"Reloaded active model for '{architecture}' from {artifact_path} (Version: {active_version['version_id']})")
        else:
            logger.warning(f"Predictor for key '{pred_key}' not currently instantiated in in-memory registry.")

        return predictor


# Global singleton registry instance
registry = ModelRegistry()
