"""
WealthGenie ML Model Registry — Core Store (SQLite-backed)

Every registered model version is a queryable row containing:
- version_id, model_architecture, training_data_hash, training_timestamp
- hyperparameters (full config JSON), metrics (Phase 4 rigor-audited numbers)
- artifact_path, artifact_hash (SHA-256 of the serialized model file)
- reference_distributions (per-feature stats for drift detection)
- active flag (exactly one version is active at any time per architecture)
"""

import hashlib
import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

DB_NAME = "model_registry.db"
_SCHEMA_VERSION = 1


def _default_db_path() -> Path:
    return Path(__file__).resolve().parent / DB_NAME


def compute_file_hash(filepath: Path) -> str:
    """Compute SHA-256 hash of a file on disk."""
    sha = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            sha.update(chunk)
    return sha.hexdigest()


def compute_data_hash(filepath: Path) -> str:
    """Compute SHA-256 hash of a dataset file (CSV/Parquet) for data lineage."""
    return compute_file_hash(filepath)


class ModelRegistry:
    """SQLite-backed model registry with tamper-evident hashing."""

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or _default_db_path()
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn: Optional[sqlite3.Connection] = None
        self._init_db()

    def _get_conn(self) -> sqlite3.Connection:
        if self._conn is None:
            self._conn = sqlite3.connect(str(self.db_path))
            self._conn.row_factory = sqlite3.Row
            self._conn.execute("PRAGMA journal_mode=WAL")
        return self._conn

    def _init_db(self) -> None:
        conn = self._get_conn()
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS model_versions (
                version_id       TEXT PRIMARY KEY,
                model_architecture TEXT NOT NULL,
                training_data_hash TEXT NOT NULL,
                training_timestamp TEXT NOT NULL,
                hyperparameters  TEXT NOT NULL,  -- JSON
                metrics          TEXT NOT NULL,  -- JSON (Phase 4 rigor metrics)
                artifact_path    TEXT NOT NULL,
                artifact_hash    TEXT NOT NULL,  -- SHA-256 of serialized model file
                reference_distributions TEXT,    -- JSON (per-feature stats for drift)
                is_active        INTEGER NOT NULL DEFAULT 0,
                registered_at    TEXT NOT NULL,
                notes            TEXT
            );

            CREATE TABLE IF NOT EXISTS registry_meta (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
        """)
        # Store schema version
        conn.execute(
            "INSERT OR IGNORE INTO registry_meta (key, value) VALUES (?, ?)",
            ("schema_version", str(_SCHEMA_VERSION)),
        )
        conn.commit()

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

        conn = self._get_conn()

        if set_active:
            # Deactivate all other versions of this architecture
            conn.execute(
                "UPDATE model_versions SET is_active = 0 WHERE model_architecture = ?",
                (model_architecture,),
            )

        conn.execute(
            """INSERT INTO model_versions
               (version_id, model_architecture, training_data_hash, training_timestamp,
                hyperparameters, metrics, artifact_path, artifact_hash,
                reference_distributions, is_active, registered_at, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                version_id,
                model_architecture,
                training_data_hash,
                training_timestamp,
                json.dumps(hyperparameters),
                json.dumps(metrics),
                str(artifact_path),
                artifact_hash,
                json.dumps(reference_distributions) if reference_distributions else None,
                1 if set_active else 0,
                now,
                notes,
            ),
        )
        conn.commit()
        return version_id

    def list_versions(
        self, architecture: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """List all registered model versions, optionally filtered by architecture."""
        conn = self._get_conn()
        if architecture:
            cursor = conn.execute(
                "SELECT * FROM model_versions WHERE model_architecture = ? ORDER BY registered_at DESC",
                (architecture,),
            )
        else:
            cursor = conn.execute(
                "SELECT * FROM model_versions ORDER BY registered_at DESC"
            )
        return [self._row_to_dict(row) for row in cursor.fetchall()]

    def get_version(self, version_id: str) -> Optional[Dict[str, Any]]:
        """Get a single registered model version by version_id."""
        conn = self._get_conn()
        cursor = conn.execute(
            "SELECT * FROM model_versions WHERE version_id = ?", (version_id,)
        )
        row = cursor.fetchone()
        return self._row_to_dict(row) if row else None

    def get_active_model(
        self, architecture: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Get the currently active model version (optionally for a specific architecture)."""
        conn = self._get_conn()
        if architecture:
            cursor = conn.execute(
                "SELECT * FROM model_versions WHERE is_active = 1 AND model_architecture = ?",
                (architecture,),
            )
        else:
            # Return the most recently activated model across architectures
            cursor = conn.execute(
                "SELECT * FROM model_versions WHERE is_active = 1 ORDER BY registered_at DESC LIMIT 1"
            )
        row = cursor.fetchone()
        return self._row_to_dict(row) if row else None

    def rollback_to_version(self, version_id: str) -> Dict[str, Any]:
        """
        Roll back the active model to a specific registered version.

        Verifies the artifact's SHA-256 hash still matches what was recorded
        at registration time. Refuses to activate a tampered/missing checkpoint.

        Returns the activated version record on success.
        Raises RuntimeError on hash mismatch or FileNotFoundError on missing artifact.
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

        conn = self._get_conn()
        # Deactivate all versions of this architecture
        conn.execute(
            "UPDATE model_versions SET is_active = 0 WHERE model_architecture = ?",
            (version["model_architecture"],),
        )
        # Activate the target version
        conn.execute(
            "UPDATE model_versions SET is_active = 1 WHERE version_id = ?",
            (version_id,),
        )
        conn.commit()

        # Return refreshed version
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
        if self._conn:
            self._conn.close()
            self._conn = None

    @staticmethod
    def _row_to_dict(row: sqlite3.Row) -> Dict[str, Any]:
        d = dict(row)
        # Deserialize JSON fields
        for json_field in ("hyperparameters", "metrics", "reference_distributions"):
            if d.get(json_field):
                d[json_field] = json.loads(d[json_field])
        d["is_active"] = bool(d.get("is_active", 0))
        return d
