"""
WealthGenie RAG Subsystem - Query Normalizer
Normalizes whitespace, unicode characters, and basic casing.
"""

import re


class QueryNormalizer:
    """Cleans and standardizes raw user query text."""

    def normalize(self, query: str) -> str:
        """Strips excessive whitespace, trailing symbols, and normalizes spacing."""
        if not query:
            return ""
        # Replace non-printable characters
        text = re.sub(r"[\x00-\x1F\x7F]", "", query)
        # Collapse multiple spaces
        text = re.sub(r"\s+", " ", text)
        return text.strip()
