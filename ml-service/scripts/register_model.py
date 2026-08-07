"""
register_model.py — CLI to register a trained model checkpoint into the registry.

Reads Phase 4's rigor report automatically to populate metrics.
Computes and stores reference distributions for drift monitoring.

Usage:
  python -m scripts.register_model \
    --checkpoint model/model.pkl \
    --architecture RandomForest \
    --metrics model/rigor_evaluation_report.json \
    --set-active
"""

import argparse
import hashlib
import json
import sys
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

import pandas as pd
from model.registry.registry_store import ModelRegistry, compute_data_hash
from model.registry.drift_detection import compute_reference_distributions


DATA_DIR = PROJECT_ROOT / "data"
PROFILES_CSV = DATA_DIR / "investment_profiles.csv"
MODEL_DIR = PROJECT_ROOT / "model"

MODEL_FEATURES = [
    "age", "annual_income", "monthly_savings", "investment_horizon",
    "liquid_savings", "existing_debt", "dependents", "emergency_fund_months",
    "risk_score", "stated_tolerance_score", "savings_rate",
    "debt_to_income_ratio", "emergency_fund_adequacy_ratio",
    "risk_capacity_vs_stated_tolerance_gap", "horizon_adjusted_urgency_score",
    "dependents_adjusted_burden_score",
]


def load_rigor_report(metrics_path: Path) -> dict:
    """Load Phase 4 rigor evaluation report."""
    with open(metrics_path, "r", encoding="utf-8") as f:
        return json.load(f)


def extract_architecture_metrics(rigor_report: dict, architecture: str) -> dict:
    """
    Extract the correct metrics for a given architecture.

    IMPORTANT: Rule-approximation fidelity comes from multi_model_benchmark.json's
    test_accuracy field (computed on the held-out test split — the established,
    approved Phase 4 numbers: RF=0.9563, MLP=0.9560, FT=0.9705).

    The rigor_evaluation_report.json's multi_model_independent_benchmark section
    stores numbers computed on the FULL dataset with potentially different checkpoint
    files, so we only use it for CFP benchmark accuracy and audit fields.
    """
    # --- CFP benchmark + audit data from rigor report ---
    multi_model = rigor_report.get("multi_model_independent_benchmark", {})
    rigor_arch_map = {
        "RandomForest": "RandomForest",
        "PyTorch_MLP": "PyTorch_FinancialMLP",
        "FT_Transformer": "FT_Transformer",
    }
    rigor_key = rigor_arch_map.get(architecture, architecture)
    rigor_metrics = multi_model.get(rigor_key, {})

    # --- Fidelity (test_accuracy) from multi_model_benchmark.json ---
    benchmark_path = MODEL_DIR.parent / "reports" / "multi_model_benchmark.json"
    fidelity = None
    if benchmark_path.exists():
        with open(benchmark_path, "r", encoding="utf-8") as f:
            benchmark = json.load(f)
        bench_arch_map = {
            "RandomForest": "random_forest",
            "PyTorch_MLP": "pytorch_mlp",
            "FT_Transformer": "ft_transformer",
        }
        bench_key = bench_arch_map.get(architecture, "")
        model_data = benchmark.get("models", {}).get(bench_key, {})
        fidelity = model_data.get("test_accuracy")

    return {
        "rule_approximation_fidelity": fidelity,
        "independent_cfp_benchmark_accuracy": rigor_metrics.get("independent_cfp_benchmark_accuracy"),
        "feature_overlap_audit": rigor_report.get("feature_overlap_audit", {}),
        "formula_overlap_percentage": rigor_report.get("independent_organic_benchmark", {})
            .get("formula_logic_audit", {})
            .get("formula_overlap_percentage"),
        "noise_robustness": rigor_report.get("noise_robustness", {}),
    }


def extract_hyperparameters(architecture: str) -> dict:
    """
    Load the full hyperparameter config for a given architecture from
    the benchmark report or config files.
    """
    benchmark_path = MODEL_DIR.parent / "reports" / "multi_model_benchmark.json"
    if benchmark_path.exists():
        with open(benchmark_path, "r", encoding="utf-8") as f:
            benchmark = json.load(f)

        models = benchmark.get("models", {})
        arch_key_map = {
            "RandomForest": "random_forest",
            "PyTorch_MLP": "pytorch_mlp",
            "FT_Transformer": "ft_transformer",
        }
        key = arch_key_map.get(architecture, "")
        if key in models:
            model_data = models[key]
            # Extract architecture-specific config
            hparams = {}
            if "architecture" in model_data:
                hparams.update(model_data["architecture"])
            for param in ("n_estimators", "max_depth", "epochs_completed",
                          "max_epochs", "best_val_loss"):
                if param in model_data:
                    hparams[param] = model_data[param]
            hparams["training_time_seconds"] = model_data.get("training_time_seconds")
            return hparams

    return {"note": "hyperparameters extracted from benchmark report"}


def main():
    parser = argparse.ArgumentParser(
        description="Register a model checkpoint into the WealthGenie ML registry."
    )
    parser.add_argument(
        "--checkpoint", type=str, required=True,
        help="Path to the serialized model file (e.g., model.pkl, ft_transformer.pt)"
    )
    parser.add_argument(
        "--architecture", type=str, required=True,
        choices=["RandomForest", "PyTorch_MLP", "FT_Transformer"],
        help="Model architecture identifier"
    )
    parser.add_argument(
        "--metrics", type=str, required=True,
        help="Path to Phase 4 rigor_evaluation_report.json"
    )
    parser.add_argument(
        "--set-active", action="store_true", default=False,
        help="Set this version as the active model for its architecture"
    )
    parser.add_argument(
        "--notes", type=str, default=None,
        help="Optional notes for this version"
    )
    parser.add_argument(
        "--db-path", type=str, default=None,
        help="Optional path to registry SQLite database"
    )

    args = parser.parse_args()

    checkpoint_path = Path(args.checkpoint)
    if not checkpoint_path.is_absolute():
        checkpoint_path = PROJECT_ROOT / checkpoint_path
    metrics_path = Path(args.metrics)
    if not metrics_path.is_absolute():
        metrics_path = PROJECT_ROOT / metrics_path

    if not checkpoint_path.exists():
        print(f"ERROR: Checkpoint file not found: {checkpoint_path}")
        sys.exit(1)
    if not metrics_path.exists():
        print(f"ERROR: Metrics file not found: {metrics_path}")
        sys.exit(1)

    # Load rigor report and extract architecture-specific metrics
    rigor_report = load_rigor_report(metrics_path)
    metrics = extract_architecture_metrics(rigor_report, args.architecture)
    hyperparameters = extract_hyperparameters(args.architecture)

    # Compute training data hash for lineage
    training_data_hash = "unavailable"
    if PROFILES_CSV.exists():
        training_data_hash = compute_data_hash(PROFILES_CSV)

    # Compute reference distributions for drift monitoring
    reference_distributions = None
    if PROFILES_CSV.exists():
        df = pd.read_csv(PROFILES_CSV)
        reference_distributions = compute_reference_distributions(df, MODEL_FEATURES)

    # Training timestamp from metadata
    metadata_path = MODEL_DIR / "metadata.json"
    training_timestamp = "unknown"
    if metadata_path.exists():
        with open(metadata_path, "r", encoding="utf-8") as f:
            meta = json.load(f)
        training_timestamp = meta.get("trained_at", training_timestamp)

    # Register
    db_path = Path(args.db_path) if args.db_path else None
    registry = ModelRegistry(db_path=db_path)
    try:
        version_id = registry.register_model(
            model_architecture=args.architecture,
            artifact_path=checkpoint_path,
            training_data_hash=training_data_hash,
            training_timestamp=training_timestamp,
            hyperparameters=hyperparameters,
            metrics=metrics,
            reference_distributions=reference_distributions,
            notes=args.notes,
            set_active=args.set_active,
        )
        print(f"[OK] Registered {args.architecture} as version {version_id}")
        if args.set_active:
            print(f"  -> Set as ACTIVE model for {args.architecture}")
    finally:
        registry.close()


if __name__ == "__main__":
    main()
