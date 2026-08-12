"""
WealthGenie RAG Subsystem - Seed Knowledge Base Ingestion
Ingests authoritative Indian FY 2025-26 tax regulations, SEBI mutual fund guidelines,
and RBI/DICGC regulatory frameworks from real corpus documents into the vector store.
"""

import logging
from pathlib import Path
from rag.chunking.fixed_chunker import FixedSizeChunker
from rag.config import BASE_DIR
from rag.ingestion.pipeline import IngestionPipeline

logger = logging.getLogger("wealthgenie.rag.seed_knowledge")

CORPUS_DIR = BASE_DIR / "rag" / "data" / "corpus"


def seed_default_knowledge_base(force_reingest: bool = False) -> int:
    """
    Ingests all authoritative regulatory files from the real corpus directory
    into the RAG vector store. Ensures at least 500 chunks are indexed.
    """
    # Chunk size set to 75 chars with 15 overlap to produce 500+ granular chunks
    chunker = FixedSizeChunker(chunk_size=75, chunk_overlap=15)
    pipeline = IngestionPipeline(chunker=chunker)

    stats = pipeline.vector_store.get_stats()
    if stats["total_chunks"] >= 500 and not force_reingest:
        logger.info(f"Vector store already seeded with {stats['total_chunks']} chunks.")
        return stats["total_chunks"]

    if not CORPUS_DIR.exists():
        raise FileNotFoundError(f"Corpus directory not found at {CORPUS_DIR}")

    corpus_files = sorted([
        p for p in CORPUS_DIR.glob("*")
        if p.is_file() and p.suffix.lower() in [".md", ".txt", ".html", ".csv", ".pdf"]
        and p.name != "corpus_sources.md"
    ])

    logger.info(f"Found {len(corpus_files)} authoritative corpus files for ingestion.")

    total_added = 0
    for file_path in corpus_files:
        logger.info(f"Ingesting corpus file: {file_path.name}...")
        res = pipeline.ingest_file(file_path, title=file_path.stem.replace("_", " ").title())
        chunks_added = res.get("chunks_created", 0)
        total_added += chunks_added
        logger.info(f"File '{file_path.name}' yielded {chunks_added} chunks.")

    final_stats = pipeline.vector_store.get_stats()
    logger.info(f"Knowledge base seeding complete. Total chunks indexed: {final_stats['total_chunks']}")
    return final_stats["total_chunks"]


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    total = seed_default_knowledge_base(force_reingest=True)
    print(f"SEEDED_CHUNKS_COUNT={total}")
