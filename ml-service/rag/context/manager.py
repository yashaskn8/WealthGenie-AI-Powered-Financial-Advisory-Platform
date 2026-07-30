"""
WealthGenie RAG Subsystem - Context Manager
Assembles, deduplicates, merges, and budgets retrieved context chunks before prompt construction.
"""

import logging
from typing import List, Set
from rag.schema import TextChunk, RetrievedChunk

logger = logging.getLogger("wealthgenie.rag.context")


class ContextManager:
    """Manages context assembly, semantic deduplication, contiguous merging, and token budgeting."""

    def __init__(
        self,
        max_context_chars: int = 4000,
        similarity_threshold: float = 0.85,
    ):
        self.max_context_chars = max_context_chars
        self.similarity_threshold = similarity_threshold

    def process_chunks(self, retrieved_chunks: List[RetrievedChunk]) -> List[RetrievedChunk]:
        """
        Deduplicates, merges contiguous document chunks, and enforces character budgeting.
        """
        if not retrieved_chunks:
            return []

        # 1. Exact & Semantic Deduplication
        deduped = self._deduplicate(retrieved_chunks)

        # 2. Sort by Rank / Relevance Score
        deduped.sort(key=lambda r: r.score, reverse=True)

        # 3. Contiguous Chunk Merging (Merge adjacent chunks from same document)
        merged = self._merge_adjacent_chunks(deduped)

        # 4. Token / Character Budgeting & Truncation
        budgeted = self._apply_budget(merged)

        return budgeted

    def _deduplicate(self, chunks: List[RetrievedChunk]) -> List[RetrievedChunk]:
        """Removes exact duplicate chunk content and highly overlapping text (>85% Jaccard similarity)."""
        unique_chunks: List[RetrievedChunk] = []
        seen_texts: List[Set[str]] = []

        for ret in chunks:
            words = set(ret.chunk.content.lower().split())
            if not words:
                continue

            is_duplicate = False
            for seen in seen_texts:
                intersection = len(words.intersection(seen))
                union = len(words.union(seen))
                jaccard_sim = float(intersection / union) if union > 0 else 0.0

                if jaccard_sim >= self.similarity_threshold:
                    is_duplicate = True
                    break

            if not is_duplicate:
                unique_chunks.append(ret)
                seen_texts.append(words)

        return unique_chunks

    def _merge_adjacent_chunks(self, chunks: List[RetrievedChunk]) -> List[RetrievedChunk]:
        """Merges contiguous chunks originating from the same parent document."""
        if len(chunks) <= 1:
            return chunks

        merged_results: List[RetrievedChunk] = []
        skip_indices: Set[int] = set()

        for i in range(len(chunks)):
            if i in skip_indices:
                continue

            curr = chunks[i]
            doc_id = curr.chunk.document_id
            curr_idx = curr.chunk.metadata.chunk_index

            merged_content = curr.chunk.content
            max_score = curr.score
            combined_rank = curr.rank

            # Check if next chunk is contiguous
            for j in range(i + 1, len(chunks)):
                if j in skip_indices:
                    continue
                next_c = chunks[j]
                if next_c.chunk.document_id == doc_id and abs(next_c.chunk.metadata.chunk_index - curr_idx) == 1:
                    merged_content += "\n\n" + next_c.chunk.content
                    max_score = max(max_score, next_c.score)
                    skip_indices.add(j)

            # Create merged chunk instance
            new_chunk_obj = TextChunk(
                chunk_id=curr.chunk.chunk_id,
                document_id=doc_id,
                content=merged_content,
                metadata=curr.chunk.metadata,
                embedding=curr.chunk.embedding,
            )

            merged_results.append(
                RetrievedChunk(chunk=new_chunk_obj, score=max_score, rank=combined_rank)
            )

        return merged_results

    def _apply_budget(self, chunks: List[RetrievedChunk]) -> List[RetrievedChunk]:
        """Applies character token budget and truncates context list safely."""
        budgeted_chunks: List[RetrievedChunk] = []
        current_chars = 0

        for ret in chunks:
            chunk_len = len(ret.chunk.content)
            if current_chars + chunk_len <= self.max_context_chars:
                budgeted_chunks.append(ret)
                current_chars += chunk_len
            else:
                # Safely truncate last chunk at boundary
                remaining_budget = self.max_context_chars - current_chars
                if remaining_budget > 100:
                    truncated_text = ret.chunk.content[:remaining_budget] + "..."
                    truncated_chunk_obj = TextChunk(
                        chunk_id=ret.chunk.chunk_id,
                        document_id=ret.chunk.document_id,
                        content=truncated_text,
                        metadata=ret.chunk.metadata,
                    )
                    budgeted_chunks.append(
                        RetrievedChunk(chunk=truncated_chunk_obj, score=ret.score, rank=ret.rank)
                    )
                break

        return budgeted_chunks
