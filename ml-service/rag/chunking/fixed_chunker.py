"""
WealthGenie RAG Subsystem - Fixed-Size Overlapping Chunker
Splits documents into fixed character length blocks with configurable sliding window overlap.
"""

from typing import List
from rag.chunking.base import BaseChunker
from rag.schema import Document, TextChunk, ChunkMetadata


class FixedSizeChunker(BaseChunker):
    """Splits documents into fixed-character text chunks with overlap."""

    def chunk_document(self, document: Document) -> List[TextChunk]:
        content = document.content
        if not content:
            return []

        chunks: List[TextChunk] = []
        step = max(1, self.chunk_size - self.chunk_overlap)
        idx = 0
        chunk_idx = 0

        while idx < len(content):
            chunk_text = content[idx : idx + self.chunk_size].strip()
            if chunk_text:
                chunk_id = f"{document.document_id}#{chunk_idx:04d}"
                metadata = ChunkMetadata(
                    chunk_id=chunk_id,
                    document_id=document.document_id,
                    chunk_index=chunk_idx,
                    title=document.metadata.title,
                    source=document.metadata.source,
                    publication_date=document.metadata.publication_date,
                    document_type=document.metadata.document_type,
                    version=document.metadata.version,
                    author=document.metadata.author,
                    token_count=len(chunk_text),
                )
                chunks.append(
                    TextChunk(
                        chunk_id=chunk_id,
                        document_id=document.document_id,
                        content=chunk_text,
                        metadata=metadata,
                    )
                )
                chunk_idx += 1
            idx += step

        return chunks
