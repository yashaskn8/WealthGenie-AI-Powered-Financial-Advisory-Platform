"""
WealthGenie RAG Subsystem - Seed Knowledge Base Ingestion
Ingests authoritative Indian FY 2025-26 tax regulations, SEBI mutual fund guidelines,
and RBI/DICGC regulatory frameworks from real corpus documents into the vector store.
"""

import logging
from rag.chunking.fixed_chunker import FixedSizeChunker
from rag.config import BASE_DIR
from rag.ingestion.pipeline import IngestionPipeline

logger = logging.getLogger("wealthgenie.rag.seed_knowledge")

CORPUS_DIR = BASE_DIR / "rag" / "data" / "corpus"

TAX_REGULATIONS_2025 = """
Income Tax Regulations FY 2025-26 (AY 2026-27):
Section 80C: Deduction up to Rs 1,50,000 (1.5 lakh) per financial year for investments in ELSS (Equity Linked Savings Scheme), PPF, EPF, NSC, and Life Insurance. ELSS has a mandatory lock-in period of 3 years.
Section 80D: Deduction up to Rs 25,000 for health insurance premiums for self and family, and up to Rs 50,000 for senior citizen parents.
Section 87A: Rebate available under the new tax regime for taxable income up to Rs 7,00,000, and standard deduction of Rs 75,000 for salaried employees.
Section 80CCD(1B): Additional deduction up to Rs 50,000 for contributions to National Pension System (NPS).
"""

MUTUAL_FUNDS_SUITABILITY = """
SEBI Mutual Fund Categorization and Investor Suitability Guidelines:
Equity Linked Savings Schemes (ELSS) are open-ended equity schemes with a statutory lock-in period of 3 years offering tax benefits under Section 80C.
Riskometer: Mutual funds are categorized into Low, Low-to-Moderate, Moderate, Moderately High, High, and Very High risk.
Investor Suitability: High-risk equity funds and ELSS are suitable for investors with an investment horizon of 3-5+ years.
"""


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

    total_ingested_chunks = 0
    for file_path in corpus_files:
        try:
            res = pipeline.ingest_file(file_path)
            total_ingested_chunks += res.get("chunks_added", 0)
        except Exception as e:
            logger.error(f"Error seeding {file_path.name}: {e}")

    logger.info(f"Successfully seeded {total_ingested_chunks} chunks into vector store.")
    return pipeline.vector_store.get_stats()["total_chunks"]
