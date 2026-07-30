"""
WealthGenie RAG Subsystem - Recursive Character Chunker
Hierarchically splits text on double newlines, single newlines, sentences, and words to preserve semantic cohesion.
"""

from typing import List
from rag.chunking.base import BaseChunker
from rag.schema import Document, TextChunk, ChunkMetadata


class RecursiveCharacterChunker(BaseChunker):
    """Recursively splits document text using natural paragraph and sentence delimiters."""

    SEPARATORS = ["\n\n", "\n", ". ", " ", ""]

    def chunk_document(self, document: Document) -> List[TextChunk]:
        content = document.content
        if not content:
            return []

        raw_chunks = self._split_text(content, self.SEPARATORS)
        chunks: List[TextChunk] = []

        for idx, text in enumerate(raw_chunks):
            text = text.strip()
            if not text:
                continue

            chunk_id = f"{document.document_id}#{idx:04d}"
            metadata = ChunkMetadata(
                chunk_id=chunk_id,
                document_id=document.document_id,
                chunk_index=idx,
                title=document.metadata.title,
                source=document.metadata.source,
                publication_date=document.metadata.publication_date,
                document_type=document.metadata.document_type,
                version=document.metadata.version,
                author=document.metadata.author,
                token_count=len(text),
            )
            chunks.append(
                TextChunk(
                    chunk_id=chunk_id,
                    document_id=document.document_id,
                    content=text,
                    metadata=metadata,
                )
            )

        return chunks

    def _split_text(self, text: str, separators: List[str]) -> List[str]:
        final_chunks: List[str] = []
        if len(text) <= self.chunk_size or not separators:
            return [text]

        sep = separators[0]
        new_separators = separators[1:]

        splits = text.split(sep) if sep else list(text)
        current_doc: List[str] = []
        current_len = 0

        for s in splits:
            item = s + sep if sep else s
            if current_len + len(item) > self.chunk_size and current_doc:
                combined = "".join(current_doc).strip()
                if len(combined) > self.chunk_size and new_separators:
                    final_chunks.extend(self._split_text(combined, new_separators))
                else:
                    final_chunks.append(combined)
                current_doc = []
                current_len = 0
            current_doc.append(item)
            current_len += len(item)

        if current_doc:
            combined = "".join(current_doc).strip()
            if len(combined) > self.chunk_size and new_separators:
                final_chunks.extend(self._split_text(combined, new_separators))
            else:
                final_chunks.append(combined)

        return final_chunks
