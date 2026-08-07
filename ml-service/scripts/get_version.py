"""
get_version.py — CLI to get full details of a registered model version.

Usage:
  python -m scripts.get_version <version_id>
"""

import argparse
import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from model.registry.registry_store import ModelRegistry


def main():
    parser = argparse.ArgumentParser(description="Get details of a registered model version.")
    parser.add_argument("version_id", type=str, help="Version ID to look up")
    parser.add_argument("--db-path", type=str, default=None)
    args = parser.parse_args()

    db_path = Path(args.db_path) if args.db_path else None
    registry = ModelRegistry(db_path=db_path)
    try:
        version = registry.get_version(args.version_id)
        if version is None:
            print(f"Version {args.version_id} not found.")
            sys.exit(1)
        print(json.dumps(version, indent=2, default=str))
    finally:
        registry.close()


if __name__ == "__main__":
    main()
