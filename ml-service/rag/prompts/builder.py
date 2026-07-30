"""
WealthGenie RAG Subsystem - Prompt Builder
Constructs strict grounding prompts separating system instructions, evidence context, and investor query.
"""

from typing import Dict, List, Any, Optional
from rag.schema import RetrievedChunk


class PromptBuilder:
    """Constructs structured, tamper-proof prompts for LLM grounded generation."""

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

    def build_prompt(
        self,
        question: str,
        retrieved_chunks: List[RetrievedChunk],
        user_profile: Optional[Dict[str, Any]] = None,
        chat_history: Optional[List[Dict[str, str]]] = None,
    ) -> str:
        """Assembles prompt parts into a formatted string."""
        context_blocks = []

        for idx, ret in enumerate(retrieved_chunks, start=1):
            chunk = ret.chunk
            source_info = f"Document: {chunk.metadata.title} (Source: {chunk.metadata.source})"
            context_blocks.append(f"[{idx}] {source_info}\nExcerpt:\n{chunk.content}")

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
            f"=== USER QUESTION ===\n{question}\n\n"
            f"=== GROUNDED ADVISORY RESPONSE ==="
        )
        return prompt
