"""
WealthGenie RAG Subsystem - Text Cleaner & Normalizer
Sanitizes raw document text, strips boilerplate noise, and preserves structural headers.
"""

import re


def clean_text(raw_text: str) -> str:
    """
    Cleans and normalizes raw text for downstream chunking and embedding.
    - Preserves Markdown headers (#, ##, ###)
    - Replaces excessive newlines with double newlines
    - Strips non-printable control characters
    """
    if not raw_text:
        return ""

    # Replace null bytes and non-printable control characters (except newline/tab)
    text = re.sub(r"[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]", "", raw_text)

    # Normalize carriage returns
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    # Replace tabs with spaces
    text = text.replace("\t", " ")

    # Reduce 3+ consecutive newlines to double newlines (paragraph boundary)
    text = re.sub(r"\n{3,}", "\n\n", text)

    # Reduce multiple inline spaces to single space
    text = re.sub(r"[ ]{2,}", " ", text)

    return text.strip()
