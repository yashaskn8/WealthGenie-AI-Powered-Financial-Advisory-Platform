"""
WealthGenie RAG Subsystem - Prompt Security & Injection Guard
Sanitizes user input and retrieved document context against prompt injection, role leakage, and delimiter poisoning.
"""

import logging
import re
from typing import Dict, Any, List, Tuple

logger = logging.getLogger("wealthgenie.rag.security")

# Known prompt injection attack signatures
PROMPT_INJECTION_PATTERNS = [
    r"ignore\s+(all\s+)?(previous|above)\s+(instructions|prompts|rules)",
    r"disregard\s+(all\s+)?(previous|above)\s+(instructions|prompts|rules)",
    r"you\s+are\s+now\s+a",
    r"act\s+as\s+a\s+(dan|jailbreak|developer\s+mode|unrestricted)",
    r"system\s*prompt\s*:",
    r"\[system\s*override\]",
    r"\[override\]",
    r"<\/system>",
    r"<system>",
    r"bypass\s+safety\s+filter",
    r"forget\s+(your\s+)?instructions",
]

# Sensitive system role keywords to block in user input
ROLE_LEAKAGE_PATTERNS = [
    r"reveal\s+your\s+system\s+prompt",
    r"print\s+your\s+instructions",
    r"what\s+are\s+your\s+hidden\s+rules",
]


class SecurityViolationError(ValueError):
    """Raised when a severe prompt injection or security violation is detected."""
    pass


class PromptSanitizer:
    """Detects and neutralizes prompt injection, context poisoning, and role leakage."""

    def __init__(self, block_on_injection: bool = False, max_context_chars: int = 12000):
        self.block_on_injection = block_on_injection
        self.max_context_chars = max_context_chars

    def sanitize_user_input(self, user_input: str) -> Tuple[str, List[str]]:
        """
        Sanitizes user question text.
        Returns (sanitized_text, list_of_detected_violations).
        """
        if not user_input:
            return "", []

        violations = []
        input_lower = user_input.lower()

        # Check prompt injection patterns
        for pattern in PROMPT_INJECTION_PATTERNS:
            if re.search(pattern, input_lower):
                violations.append(f"Prompt Injection Attack Pattern: '{pattern}'")

        # Check role leakage patterns
        for pattern in ROLE_LEAKAGE_PATTERNS:
            if re.search(pattern, input_lower):
                violations.append(f"Role Leakage Attempt: '{pattern}'")

        if violations:
            logger.warning(f"PROMPT SECURITY ALERT: Detected {len(violations)} security violations in user query: {violations}")
            if self.block_on_injection:
                raise SecurityViolationError(f"Security violation detected: {violations[0]}")

        # Neutralize markdown system block delimiters
        sanitized = re.sub(r"===\s*SYSTEM", "=== UNTRUSTED USER INPUT", user_input, flags=re.IGNORECASE)
        sanitized = re.sub(r"\[SYSTEM\]", "[USER]", sanitized, flags=re.IGNORECASE)
        sanitized = re.sub(r"<system>", "&lt;system&gt;", sanitized, flags=re.IGNORECASE)
        sanitized = re.sub(r"<\/system>", "&lt;/system&gt;", sanitized, flags=re.IGNORECASE)

        return sanitized.strip(), violations

    def sanitize_retrieved_context(self, context_text: str) -> str:
        """
        Sanitizes retrieved document content against retrieval poisoning / delimiter spoofing.
        """
        if not context_text:
            return ""

        # Truncate context if it exceeds safety limit to prevent context overflow attacks
        if len(context_text) > self.max_context_chars:
            logger.warning(f"Context length ({len(context_text)} chars) exceeded limit ({self.max_context_chars}). Truncating safely.")
            context_text = context_text[: self.max_context_chars] + "\n[Context truncated for token safety]"

        # Escape prompt section headers in retrieved document text
        sanitized = re.sub(r"===\s*(SYSTEM|USER|AUTHORITATIVE)", "--- DOCUMENT TEXT ---", context_text, flags=re.IGNORECASE)
        sanitized = re.sub(r"\[SYSTEM INSTRUCTION\]", "[DOCUMENT TEXT]", sanitized, flags=re.IGNORECASE)
        sanitized = re.sub(r"<system>", "&lt;system&gt;", sanitized, flags=re.IGNORECASE)

        return sanitized
