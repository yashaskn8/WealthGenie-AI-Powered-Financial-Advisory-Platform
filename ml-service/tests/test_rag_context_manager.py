"""
WealthGenie RAG Subsystem - Context Manager Test Suite
Tests deduplication, adjacent chunk merging, token budgeting, and PromptBuilder integration.
"""

from rag.context.manager import ContextManager
from rag.prompts.builder import PromptBuilder
from rag.schema import TextChunk, ChunkMetadata, RetrievedChunk


def _make_retrieved_chunk(cid: str, doc_id: str, idx: int, content: str, score: float = 0.9) -> RetrievedChunk:
    meta = ChunkMetadata(
        chunk_id=cid,
        document_id=doc_id,
        chunk_index=idx,
        title="Tax Guide",
        source="tax.md",
    )
    chunk = TextChunk(chunk_id=cid, document_id=doc_id, content=content, metadata=meta)
    return RetrievedChunk(chunk=chunk, score=score, rank=idx + 1)


def test_context_deduplication():
    manager = ContextManager(similarity_threshold=0.85)

    c1 = _make_retrieved_chunk("c1", "doc1", 0, "Under Section 87A rebate for FY 2025-26 tax is zero up to 12 Lakhs.")
    c2 = _make_retrieved_chunk("c2", "doc1", 1, "Under Section 87A rebate for FY 2025-26 tax is zero up to 12 Lakhs.")  # Duplicate

    results = manager.process_chunks([c1, c2])
    assert len(results) == 1
    assert results[0].chunk.chunk_id == "c1"


def test_adjacent_chunk_merging():
    manager = ContextManager()

    c1 = _make_retrieved_chunk("c1", "doc1", 0, "Paragraph 1: Section 87A rebate applies to New Tax Regime.")
    c2 = _make_retrieved_chunk("c2", "doc1", 1, "Paragraph 2: Maximum rebate covers income up to 12 Lakhs.")

    results = manager.process_chunks([c1, c2])
    assert len(results) == 1
    assert "Paragraph 1" in results[0].chunk.content
    assert "Paragraph 2" in results[0].chunk.content


def test_character_budgeting_and_truncation():
    manager = ContextManager(max_context_chars=120)

    c1 = _make_retrieved_chunk("c1", "doc1", 0, "Short chunk 1 content.")
    c2 = _make_retrieved_chunk("c2", "doc2", 0, "Extremely long chunk text " * 10)

    results = manager.process_chunks([c1, c2])
    total_len = sum(len(r.chunk.content) for r in results)
    assert total_len <= 150
    assert "..." in results[-1].chunk.content or len(results) == 1


def test_prompt_builder_context_manager_integration():
    manager = ContextManager(max_context_chars=300)
    builder = PromptBuilder(context_manager=manager)

    c1 = _make_retrieved_chunk("c1", "doc1", 0, "Section 80C ELSS deduction up to 1.5 Lakhs.")
    c2 = _make_retrieved_chunk("c2", "doc1", 0, "Section 80C ELSS deduction up to 1.5 Lakhs.")  # Dup

    prompt = builder.build_prompt("What is Section 80C?", [c1, c2])
    assert "Section 80C ELSS" in prompt
    assert prompt.count("Section 80C ELSS") == 1  # Deduplicated
