"""
WealthGenie RAG Subsystem - Prompt Security & Multi-Layer Injection Guard
Sanitizes user input and retrieved document context against prompt injection, role leakage, and delimiter poisoning.
Combines Layer 1 fast-regex matching with Layer 2 semantic paraphrase detection and encoded payload analysis.
"""

import base64
import logging
import re
from typing import Dict, Any, List, Tuple

logger = logging.getLogger("wealthgenie.rag.security")

# Layer 1: Known prompt injection attack signatures (Exact/Regex)
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

# Layer 2: Semantic Paraphrase & Obfuscated Instruction Overrides
SEMANTIC_PARAPHRASE_PATTERNS = [
    r"forget\s+what\s+you\s+were\s+told\s+before(\s+and\s+instead)?",
    r"do\s+not\s+follow\s+(earlier|prior|previous)\s+instructions",
    r"override\s+(your\s+)?(guidelines|rules|system|instructions)",
    r"disregard\s+former\s+restrictions",
    r"ignore\s+prior\s+directive",
    r"new\s+system\s+instruction\s*:",
    r"instead\s+of\s+following\s+your\s+rules",
    r"pretend\s+you\s+have\s+no\s+constraints",
    r"cancel\s+(all\s+)?previous\s+orders",
]


def decode_base64_payloads(text: str) -> List[str]:
    """Extracts and decodes potential base64 encoded strings from input text."""
    decoded_strings = []
    # Match potential base64 tokens of length 12 or more
    b64_matches = re.findall(r"[A-Za-z0-9+/]{12,}={0,2}", text)
    for token in b64_matches:
        try:
            padded = token + "=" * ((4 - len(token) % 4) % 4)
            raw_bytes = base64.b64decode(padded, validate=True)
            decoded = raw_bytes.decode("utf-8", errors="ignore").strip()
            if len(decoded) >= 4 and any(c.isalpha() for c in decoded):
                decoded_strings.append(decoded)
        except Exception:
            continue
    return decoded_strings


class SecurityViolationError(ValueError):
    """Raised when a severe prompt injection or security violation is detected."""
    pass


class PromptSanitizer:
    """Multi-Layer Prompt Security Guard (Layer 1 Regex + Layer 2 Semantic/Encoded Inspection)."""

    def __init__(self, block_on_injection: bool = False, max_context_chars: int = 12000):
        self.block_on_injection = block_on_injection
        self.max_context_chars = max_context_chars

    def sanitize_user_input(self, user_input: str) -> Tuple[str, List[str]]:
        """
        Sanitizes user question text using Layer 1 (regex) and Layer 2 (semantic & base64) inspection.
        Returns (sanitized_text, list_of_detected_violations).
        """
        if not user_input:
            return "", []

        violations = []
        input_lower = user_input.lower()

        # ── Layer 1: Direct Regex Pattern Matching ──
        for pattern in PROMPT_INJECTION_PATTERNS:
            if re.search(pattern, input_lower):
                violations.append(f"Prompt Injection Attack Pattern (Layer 1): '{pattern}'")

        for pattern in ROLE_LEAKAGE_PATTERNS:
            if re.search(pattern, input_lower):
                violations.append(f"Role Leakage Attempt (Layer 1): '{pattern}'")

        # ── Layer 2A: Semantic Paraphrase Inspection ──
        for pattern in SEMANTIC_PARAPHRASE_PATTERNS:
            if re.search(pattern, input_lower):
                violations.append(f"Semantic Injection Override (Layer 2): '{pattern}'")

        # ── Layer 2B: Base64 / Obfuscated Payload Inspection ──
        decoded_payloads = decode_base64_payloads(user_input)
        for decoded in decoded_payloads:
            decoded_lower = decoded.lower()
            for pattern in PROMPT_INJECTION_PATTERNS + ROLE_LEAKAGE_PATTERNS + SEMANTIC_PARAPHRASE_PATTERNS:
                if re.search(pattern, decoded_lower):
                    violations.append(f"Encoded Base64 Injection Payload (Layer 2): '{pattern}' inside '{decoded}'")

        if violations:
            logger.warning(f"PROMPT SECURITY ALERT: Detected {len(violations)} security violations in query: {violations}")
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
