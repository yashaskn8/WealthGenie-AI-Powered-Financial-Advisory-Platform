"""
WealthGenie ML Microservice - Model Version Registry Router
Exposes live HTTP endpoints for model version inspection, registration, integrity verification, and rollback.
"""

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Security, status
from pydantic import BaseModel, Field

from model.serving.registry import registry
from store_factory import get_model_registry

logger = logging.getLogger("wealthgenie.registry.router")

registry_router = APIRouter(prefix="/model/registry", tags=["Model Registry"])


def get_version_store():
    """Dependency returning the active ModelRegistry store instance."""
    store = registry.get_version_registry()
    if store is None:
        store = get_model_registry()
        registry.set_version_registry(store)
    return store


class RegisterModelRequest(BaseModel):
    model_config = {"protected_namespaces": ()}
    model_architecture: str = Field(..., description="Model architecture identifier (e.g. RandomForest, PyTorch_MLP, FT_Transformer)")
    artifact_path: str = Field(..., description="Path to serialized model artifact on disk")
    training_data_hash: Optional[str] = Field("live_api_seeded", description="SHA-256 hash of training data")
    training_timestamp: Optional[str] = Field(None, description="ISO timestamp of training completion")
    hyperparameters: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Model hyperparameters")
    metrics: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Evaluation metrics (accuracy, fidelity, F1)")
    reference_distributions: Optional[Dict[str, Any]] = Field(None, description="Feature reference distributions for drift monitoring")
    notes: Optional[str] = Field(None, description="Optional version release notes")
    set_active: bool = Field(False, description="Whether to immediately set this version as active")


@registry_router.get("/versions")
def list_versions(
    architecture: Optional[str] = Query(None, description="Filter by model architecture"),
    store = Depends(get_version_store),
):
    """Lists all registered model versions from the persistent registry."""
    versions = store.list_versions(architecture=architecture)
    return {
        "count": len(versions),
        "architecture_filter": architecture,
        "versions": versions,
    }


@registry_router.get("/active")
def get_active_model(
    architecture: Optional[str] = Query(None, description="Filter by model architecture"),
    store = Depends(get_version_store),
):
    """Retrieves the currently active model version from the persistent registry."""
    active = store.get_active_model(architecture=architecture)
    if not active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No active model found in registry{' for architecture ' + architecture if architecture else ''}."
        )
    return {"active_model": active}


@registry_router.get("/versions/{version_id}")
def get_version(
    version_id: str,
    store = Depends(get_version_store),
):
    """Retrieves metadata and metrics for a specific model version by UUID."""
    version = store.get_version(version_id)
    if not version:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Model version '{version_id}' not found in registry."
        )
    return version


@registry_router.get("/integrity/{version_id}")
def verify_artifact_integrity(
    version_id: str,
    store = Depends(get_version_store),
):
    """Verifies SHA-256 tamper-evident hash of the registered artifact against disk."""
    try:
        return store.verify_artifact_integrity(version_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@registry_router.post("/register", status_code=status.HTTP_201_CREATED)
def register_model_version(
    payload: RegisterModelRequest,
    store = Depends(get_version_store),
):
    """Registers a new model version into the persistent version registry."""
    artifact_path = Path(payload.artifact_path)
    if not artifact_path.exists():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Artifact file not found at path: {payload.artifact_path}"
        )

    from datetime import datetime, timezone
    training_timestamp = payload.training_timestamp or datetime.now(timezone.utc).isoformat()

    try:
        version_id = store.register_model(
            model_architecture=payload.model_architecture,
            artifact_path=artifact_path,
            training_data_hash=payload.training_data_hash or "unknown",
            training_timestamp=training_timestamp,
            hyperparameters=payload.hyperparameters or {},
            metrics=payload.metrics or {},
            reference_distributions=payload.reference_distributions,
            notes=payload.notes,
            set_active=payload.set_active,
        )

        if payload.set_active:
            registry.reload_active_model(payload.model_architecture)

        return {
            "status": "registered",
            "version_id": version_id,
            "model_architecture": payload.model_architecture,
            "is_active": payload.set_active,
        }
    except Exception as e:
        logger.error(f"Failed to register model: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@registry_router.post("/rollback/{version_id}")
def rollback_model_version(
    version_id: str,
    store = Depends(get_version_store),
):
    """Rolls back the active model to a specific registered version with tamper-evident verification."""
    try:
        active_record = store.rollback_to_version(version_id)
        registry.reload_active_model(active_record["model_architecture"])
        return {
            "status": "rolled_back",
            "active_version": active_record,
        }
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
