"""
WealthGenie Open-Weight LLM Platform - Dataset File Loader & Exporter
Supports loading and exporting dataset files in JSONL, JSON, CSV, and Parquet formats.
"""

import json
import logging
from pathlib import Path
from typing import Dict, Any, List
import pandas as pd

logger = logging.getLogger("wealthgenie.llm.dataset.loader")


def load_dataset_file(file_path: Path) -> List[Dict[str, Any]]:
    """Loads raw dataset records from JSONL, JSON, CSV, or Parquet files."""
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"Dataset file '{path}' does not exist.")

    suffix = path.suffix.lower()

    if suffix == ".jsonl":
        records = []
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    records.append(json.loads(line))
        return records

    elif suffix == ".json":
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return data
        elif isinstance(data, dict) and "samples" in data:
            return data["samples"]
        return [data]

    elif suffix == ".csv":
        df = pd.read_csv(path)
        return df.to_dict(orient="records")

    elif suffix in (".parquet", ".pq"):
        df = pd.read_parquet(path)
        return df.to_dict(orient="records")

    else:
        raise ValueError(f"Unsupported dataset file format: '{suffix}'. Supported: .jsonl, .json, .csv, .parquet")


def save_dataset_file(samples: List[Dict[str, Any]], file_path: Path) -> None:
    """Exports dataset records to JSONL, JSON, CSV, or Parquet format."""
    path = Path(file_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    suffix = path.suffix.lower()

    if suffix == ".jsonl":
        with open(path, "w", encoding="utf-8") as f:
            for s in samples:
                f.write(json.dumps(s, ensure_ascii=False) + "\n")

    elif suffix == ".json":
        with open(path, "w", encoding="utf-8") as f:
            json.dump(samples, f, indent=2, ensure_ascii=False)

    elif suffix == ".csv":
        df = pd.DataFrame(samples)
        df.to_csv(path, index=False, encoding="utf-8")

    elif suffix in (".parquet", ".pq"):
        df = pd.DataFrame(samples)
        df.to_parquet(path, index=False)

    else:
        raise ValueError(f"Unsupported export format: '{suffix}'. Supported: .jsonl, .json, .csv, .parquet")
