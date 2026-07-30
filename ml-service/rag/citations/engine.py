"""
WealthGenie RAG Subsystem - Citation Engine
Formats citations and maps retrieved evidence chunks to source references in generated responses.
"""

from typing import List
from rag.schema import Citation, RetrievedChunk


class CitationEngine:
    """Extracts and formats formal citations from retrieved evidence chunks."""

    def generate_citations(self, retrieved_chunks: List[RetrievedChunk]) -> List[Citation]:
        """Generates a structured list of Citations from top-k retrieved chunks."""
        citations: List[Citation] = []

        for idx, ret in enumerate(retrieved_chunks, start=1):
            chunk = ret.chunk
            excerpt = chunk.content[:200] + "..." if len(chunk.content) > 200 else chunk.content
            citations.append(
                Citation(
                    citation_id=idx,
                    document_title=chunk.metadata.title,
                    source=chunk.metadata.source,
                    chunk_id=chunk.chunk_id,
                    excerpt=excerpt,
                    relevance_score=ret.score,
                )
            )

        return citations

    def format_citations_markdown(self, citations: List[Citation]) -> str:
        """Formats citations list into a clean Markdown reference section."""
        if not citations:
            return ""

        lines = ["\n\n### 📚 References & Sources"]
        for cite in citations:
            lines.append(
                f"- **[{cite.citation_id}]** *{cite.document_title}* ({cite.source}) — "
                f"Relevance: `{cite.relevance_score:.2f}`"
            )
        return "\n".join(lines)
