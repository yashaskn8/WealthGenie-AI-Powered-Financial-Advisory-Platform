"""
WealthGenie ML Model Registry - MongoDB-backed Store

Drop-in replacement for the SQLite-backed ModelRegistry that stores all model
version metadata in MongoDB, enabling shared state across multiple replicas.

Preserves the same public interface and SHA-256 tamper-evident artifact hashing.
"""

import hashlib
import json
import uuid
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from pymongo import MongoClient, DESCENDING
from pymongo.errors import ConnectionFailure

logger = logging.getLogger("wealthgenie.registry.mongo")

_SCHEMA_VERSION = 1


def compute_file_hash(filepath: Path) -> str:
    """Compute SHA-256 hash of a file on disk."""
    sha = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha.update(chunk)
    return sha.hexdigest()


class MongoModelRegistry:
    """
    MongoDB-backed model registry with tamper-evident hashing.

    Same public interface as the SQLite ModelRegistry so callers can swap
    transparently. Stores model versions as documents in the
    'model_versions' collection.
    """

    def __init__(self, mongo_uri: str, db_name: str = "wealthgenie"):
        self._client = MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
        self._db = self._client[db_name]
        self._collection = self._db["model_versions"]
        self._init_indexes()

    def _init_indexes(self) -> None:
        """Create indexes for efficient queries."""
        try:
            self._collection.create_index("version_id", unique=True)
            self._collection.create_index("model_architecture")
            self._collection.create_index(
                [("model_architecture", 1), ("is_active", 1)]
            )
            self._collection.create_index(
                [("registered_at", DESCENDING)]
            )
            # Store schema version in a meta collection
            meta = self._db["registry_meta"]
            meta.update_one(
                {"key": "schema_version"},
                {"$setOnInsert": {"key": "schema_version", "value": str(_SCHEMA_VERSION)}},
                upsert=True,
            )
            logger.info("MongoModelRegistry initialized with indexes")
        except ConnectionFailure as e:
            logger.error(f"Failed to connect to MongoDB for registry: {e}")
            raise

    def register_model(
        self,
        model_architecture: str,
        artifact_path: Path,
        training_data_hash: str,
        training_timestamp: str,
        hyperparameters: Dict[str, Any],
        metrics: Dict[str, Any],
        reference_distributions: Optional[Dict[str, Any]] = None,
        notes: Optional[str] = None,
        set_active: bool = False,
    ) -> str:
        """
        Register a new model version in the registry.
        Returns the generated version_id (UUID).
        """
        artifact_path = Path(artifact_path)
        if not artifact_path.exists():
            raise FileNotFoundError(f"Artifact file not found: {artifact_path}")

        artifact_hash = compute_file_hash(artifact_path)
        version_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        if set_active:
            # Deactivate all other versions of this architecture
            self._collection.update_many(
                {"model_architecture": model_architecture},
                {"$set": {"is_active": False}},
            )

        doc = {
            "version_id": version_id,
            "model_architecture": model_architecture,
            "training_data_hash": training_data_hash,
            "training_timestamp": training_timestamp,
            "hyperparameters": hyperparameters,
            "metrics": metrics,
            "artifact_path": str(artifact_path),
            "artifact_hash": artifact_hash,
            "reference_distributions": reference_distributions,
            "is_active": set_active,
            "registered_at": now,
            "notes": notes,
        }

        self._collection.insert_one(doc)
        logger.info(f"Registered model version {version_id} ({model_architecture})")
        return version_id

    def list_versions(
        self, architecture: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """List all registered model versions, optionally filtered by architecture."""
        query = {}
        if architecture:
            query["model_architecture"] = architecture
        cursor = self._collection.find(
            query, {"_id": 0}
        ).sort("registered_at", DESCENDING)
        return [self._clean_doc(doc) for doc in cursor]

    def get_version(self, version_id: str) -> Optional[Dict[str, Any]]:
        """Get a single registered model version by version_id."""
        doc = self._collection.find_one(
            {"version_id": version_id}, {"_id": 0}
        )
        return self._clean_doc(doc) if doc else None

    def get_active_model(
        self, architecture: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Get the currently active model version."""
        query: Dict[str, Any] = {"is_active": True}
        if architecture:
            query["model_architecture"] = architecture
        doc = self._collection.find_one(
            query, {"_id": 0}, sort=[("registered_at", DESCENDING)]
        )
        return self._clean_doc(doc) if doc else None

    def rollback_to_version(self, version_id: str) -> Dict[str, Any]:
        """
        Roll back the active model to a specific registered version.
        Verifies artifact SHA-256 hash integrity before activation.
        """
        version = self.get_version(version_id)
        if version is None:
            raise ValueError(f"Version {version_id} not found in registry.")

        artifact_path = Path(version["artifact_path"])
        if not artifact_path.exists():
            raise FileNotFoundError(
                f"Artifact file missing at {artifact_path}. "
                f"Cannot roll back to version {version_id}."
            )

        current_hash = compute_file_hash(artifact_path)
        if current_hash != version["artifact_hash"]:
            raise RuntimeError(
                f"TAMPER DETECTED: Artifact hash mismatch for version {version_id}. "
                f"Registered hash: {version['artifact_hash']}, "
                f"Current hash: {current_hash}. Rollback REFUSED."
            )

        # Deactivate all versions of this architecture
        self._collection.update_many(
            {"model_architecture": version["model_architecture"]},
            {"$set": {"is_active": False}},
        )
        # Activate the target version
        self._collection.update_one(
            {"version_id": version_id},
            {"$set": {"is_active": True}},
        )

        return self.get_version(version_id)  # type: ignore

    def verify_artifact_integrity(self, version_id: str) -> Dict[str, Any]:
        """Check if a registered artifact's hash still matches what's on disk."""
        version = self.get_version(version_id)
        if version is None:
            raise ValueError(f"Version {version_id} not found.")

        artifact_path = Path(version["artifact_path"])
        if not artifact_path.exists():
            return {
                "version_id": version_id,
                "integrity": "MISSING",
                "message": f"Artifact file not found at {artifact_path}",
            }

        current_hash = compute_file_hash(artifact_path)
        matches = current_hash == version["artifact_hash"]
        return {
            "version_id": version_id,
            "integrity": "VERIFIED" if matches else "TAMPERED",
            "registered_hash": version["artifact_hash"],
            "current_hash": current_hash,
            "match": matches,
        }

    def close(self) -> None:
        """Close the MongoDB connection."""
        if self._client:
            self._client.close()

    @staticmethod
    def _clean_doc(doc: Dict[str, Any]) -> Dict[str, Any]:
        """Remove MongoDB internal fields and ensure consistent types."""
        doc.pop("_id", None)
        doc["is_active"] = bool(doc.get("is_active", False))
        return doc
