"""
list_versions.py — CLI to list all registered model versions.

Usage:
  python -m scripts.list_versions
  python -m scripts.list_versions --architecture RandomForest
"""

import argparse
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from model.registry.registry_store import ModelRegistry


def main():
    parser = argparse.ArgumentParser(description="List registered model versions.")
    parser.add_argument("--architecture", type=str, default=None,
                        help="Filter by architecture (RandomForest, PyTorch_MLP, FT_Transformer)")
    parser.add_argument("--db-path", type=str, default=None)
    args = parser.parse_args()

    db_path = Path(args.db_path) if args.db_path else None
    registry = ModelRegistry(db_path=db_path)
    try:
        versions = registry.list_versions(architecture=args.architecture)
        if not versions:
            print("No model versions registered.")
            return

        print(f"{'Version ID':<40} {'Architecture':<18} {'Active':<8} {'Registered At':<28} {'Rule Fidelity':<15} {'CFP Acc':<10}")
        print("-" * 120)
        for v in versions:
            metrics = v.get("metrics", {})
            fidelity = metrics.get("rule_approximation_fidelity", "N/A")
            cfp_acc = metrics.get("independent_cfp_benchmark_accuracy", "N/A")
            active = "*" if v["is_active"] else ""
            print(f"{v['version_id']:<40} {v['model_architecture']:<18} {active:<8} {v['registered_at']:<28} {str(fidelity):<15} {str(cfp_acc):<10}")
    finally:
        registry.close()


if __name__ == "__main__":
    main()
