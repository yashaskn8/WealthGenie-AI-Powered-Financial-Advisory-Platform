from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from model.registry.registry_store import ModelRegistry
from model.registry.router import (
    PROMOTION_TRACKED_METRICS,
    PromoteRequest,
    ValidateRequest,
    get_version_store,
    promote_version,
    registry_router,
    validate_version,
)


API_KEY = "prediction-client-key"
OPERATOR_KEY = "registry-operator-key"


@pytest.fixture
def auth_app(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "test")
    monkeypatch.setenv("ML_SERVICE_API_KEY", API_KEY)
    monkeypatch.setenv("ML_OPERATOR_KEY", OPERATOR_KEY)
    app = FastAPI()
    app.include_router(registry_router)
    app.dependency_overrides[get_version_store] = lambda: object()
    return app


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("post", "/model/registry/register", {"model_architecture": "RandomForest", "artifact_path": "missing"}),
        ("post", "/model/registry/validate/version", {"metrics": {}}),
        ("post", "/model/registry/promote", {"version_id": "version"}),
        ("delete", "/model/registry/drift/buffer", None),
        ("post", "/model/registry/drift-check", {}),
        ("post", "/model/registry/rollback/version", None),
        ("post", "/model/registry/shadow/configure", {"version_id": "version"}),
        ("delete", "/model/registry/shadow", None),
    ],
)
def test_prediction_credential_cannot_mutate_registry(auth_app, method, path, body):
    with TestClient(auth_app, headers={"X-API-Key": API_KEY}) as client:
        response = client.request(method, path, json=body)
    assert response.status_code == 403


def _register(store: ModelRegistry, artifact: Path, metrics: dict, *, active: bool = False) -> str:
    return store.register_model(
        model_architecture="RandomForest",
        artifact_path=artifact,
        training_data_hash="training-hash",
        training_timestamp=datetime.now(timezone.utc).isoformat(),
        hyperparameters={},
        metrics=metrics,
        set_active=active,
    )


def test_operator_lifecycle_requires_shadow_validation_and_complete_evidence(tmp_path, monkeypatch):
    artifact = tmp_path / "model.pkl"
    artifact.write_bytes(b"model-artifact")
    store = ModelRegistry(tmp_path / "registry.sqlite")
    metrics = {name: 0.9 for name in PROMOTION_TRACKED_METRICS}

    active_id = _register(store, artifact, metrics, active=True)
    candidate_id = _register(store, artifact, metrics)

    with pytest.raises(HTTPException) as direct_promotion:
        promote_version(PromoteRequest(version_id=candidate_id), store)
    assert direct_promotion.value.status_code == 409

    store.update_lifecycle_state(candidate_id, "SHADOW")
    with pytest.raises(HTTPException) as missing_evidence:
        validate_version(
            candidate_id,
            ValidateRequest(metrics={PROMOTION_TRACKED_METRICS[0]: 0.9}),
            store,
        )
    assert missing_evidence.value.status_code == 409

    validated = validate_version(candidate_id, ValidateRequest(metrics=metrics), store)
    assert validated["lifecycle_state"] == "VALIDATED"

    monkeypatch.setattr("model.registry.router.registry.reload_active_model", lambda architecture: None)
    promoted = promote_version(PromoteRequest(version_id=candidate_id), store)
    assert promoted["is_active"] is True
    assert store.get_version(candidate_id)["lifecycle_state"] == "ACTIVE"
    assert store.get_version(active_id)["lifecycle_state"] == "ROLLED_BACK"


def test_lifecycle_store_rejects_invalid_transition(tmp_path):
    artifact = tmp_path / "model.pkl"
    artifact.write_bytes(b"model-artifact")
    store = ModelRegistry(tmp_path / "registry.sqlite")
    candidate_id = _register(store, artifact, {name: 0.9 for name in PROMOTION_TRACKED_METRICS})

    with pytest.raises(ValueError, match="CANDIDATE -> VALIDATED"):
        store.update_lifecycle_state(candidate_id, "VALIDATED")


def test_skip_gate_is_not_a_supported_promotion_input():
    with pytest.raises(ValidationError):
        PromoteRequest(version_id="candidate", skip_gate=True)

