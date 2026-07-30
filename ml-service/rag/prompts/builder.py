"""
WealthGenie RAG Subsystem - Prompt Builder
Constructs strict, tamper-proof grounding prompts separating system instructions, evidence context, and investor query.
"""

from typing import Dict, List, Any, Optional
from rag.context.manager import ContextManager
from rag.schema import RetrievedChunk
from rag.security.prompt_sanitizer import PromptSanitizer


class PromptBuilder:
    """Constructs structured, hardened prompts for LLM grounded generation."""

    SYSTEM_PROMPT = (
        "You are WealthGenie AI, a trusted Indian financial advisory assistant. "
        "Your task is to answer the user's question accurately using ONLY the provided authoritative evidence context. "
        "Rules:\n"
        "1. Ground your answer strictly in the provided Context excerpts.\n"
        "2. If the context does not contain enough evidence to answer the question, state: "
        "'I cannot find authoritative details on this in the knowledge base.' Do NOT fabricate rules or tax slabs.\n"
        "3. Cite source document titles using inline numerical tags like [1], [2].\n"
        "4. Be professional, concise, and structured."
    )

    def __init__(
        self,
        sanitizer: Optional[PromptSanitizer] = None,
        context_manager: Optional[ContextManager] = None,
    ):
        self.sanitizer = sanitizer or PromptSanitizer()
        self.context_manager = context_manager or ContextManager()

    def build_prompt(
        self,
        question: str,
        retrieved_chunks: List[RetrievedChunk],
        user_profile: Optional[Dict[str, Any]] = None,
        chat_history: Optional[List[Dict[str, str]]] = None,
    ) -> str:
        """Assembles, manages context budgeting/deduplication, and sanitizes prompt parts."""
        # 1. Sanitize user question
        safe_question, violations = self.sanitizer.sanitize_user_input(question)

        # 2. Manage Context (Deduplicate, Merge Adjacent, Apply Budget)
        managed_chunks = self.context_manager.process_chunks(retrieved_chunks)

        # 3. Build and sanitize context blocks
        context_blocks = []
        for idx, ret in enumerate(managed_chunks, start=1):
            chunk = ret.chunk
            safe_content = self.sanitizer.sanitize_retrieved_context(chunk.content)
            source_info = f"Document: {chunk.metadata.title} (Source: {chunk.metadata.source})"
            context_blocks.append(f"[{idx}] {source_info}\nExcerpt:\n{safe_content}")

        context_str = "\n\n".join(context_blocks) if context_blocks else "No relevant context found."

        profile_str = ""
        if user_profile:
            profile_items = [f"- {k}: {v}" for k, v in user_profile.items() if v is not None]
            if profile_items:
                profile_str = "\nInvestor Profile Context:\n" + "\n".join(profile_items) + "\n"

        prompt = (
            f"=== SYSTEM INSTRUCTIONS ===\n{self.SYSTEM_PROMPT}\n\n"
            f"{profile_str}"
            f"=== AUTHORITATIVE RETRIEVED EVIDENCE CONTEXT ===\n{context_str}\n\n"
            f"=== USER QUESTION ===\n{safe_question}\n\n"
            f"=== GROUNDED ADVISORY RESPONSE ==="
        )
        return prompt
