"""
WealthGenie Open-Weight LLM Platform - Dataset Cleaner & Deduplicator
Provides text normalization, schema validation, and SHA256 exact content deduplication.
"""

import hashlib
import re
import unicodedata
from typing import Dict, Any, List, Tuple


def clean_text(text: str) -> str:
    """Normalizes text by stripping control characters and harmonizing whitespace."""
    if not isinstance(text, str):
        return ""
    # Normalize unicode
    normalized = unicodedata.normalize("NFKD", text)
    # Strip non-printable ASCII/control characters except standard newlines/tabs
    cleaned = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]", "", normalized)
    # Strip inline whitespace per line
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in cleaned.splitlines()]
    # Rejoin lines with max double newline for paragraph separation
    res = "\n".join(lines)
    res = re.sub(r"\n{3,}", "\n\n", res)
    return res.strip()


def validate_sample(sample: Dict[str, Any], min_tokens: int = 3) -> bool:
    """Validates whether a sample meets structural and minimal text length criteria."""
    if not isinstance(sample, dict):
        return False

    # Case 1: Instruction Dataset Sample
    if "instruction" in sample or "output" in sample:
        inst = sample.get("instruction", "")
        out = sample.get("output", "")
        if not inst or not out:
            return False
        if len(str(inst).split()) < min_tokens or len(str(out).split()) < min_tokens:
            return False
        return True

    # Case 2: Conversation Dataset Sample
    elif "messages" in sample:
        msgs = sample.get("messages", [])
        if not isinstance(msgs, list) or len(msgs) < 2:
            return False
        for m in msgs:
            if not isinstance(m, dict) or "role" not in m or "content" not in m:
                return False
            if not m["content"] or not str(m["content"]).strip():
                return False
        return True

    # Case 3: Simple text payload
    elif "text" in sample:
        text = sample.get("text", "")
        return bool(text and len(str(text).split()) >= min_tokens)

    return False


def deduplicate_samples(samples: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], int]:
    """
    Performs deterministic SHA256 content deduplication on normalized sample text representations.
    Returns clean samples and the count of removed duplicate entries.
    """
    seen_hashes = set()
    unique_samples = []
    duplicates_count = 0

    for sample in samples:
        # Construct canonical string representation for hashing
        if "messages" in sample:
            canonical = "|".join(f"{m.get('role','')}:{clean_text(str(m.get('content','')))}" for m in sample["messages"])
        elif "instruction" in sample:
            inst = clean_text(str(sample.get("instruction", "")))
            inp = clean_text(str(sample.get("input", "")))
            out = clean_text(str(sample.get("output", "")))
            canonical = f"inst:{inst}|inp:{inp}|out:{out}"
        else:
            canonical = clean_text(str(sample))

        content_hash = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
        if content_hash in seen_hashes:
            duplicates_count += 1
        else:
            seen_hashes.add(content_hash)
            unique_samples.append(sample)

    return unique_samples, duplicates_count
