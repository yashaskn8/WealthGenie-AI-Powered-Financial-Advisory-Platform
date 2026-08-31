"""
WealthGenie RAG Subsystem - Performance & Latency Benchmarking Framework
Measures ingestion throughput, query latency percentiles (P50, P90, P99), QPS, and cache hit efficiency.
"""

import logging
import time
from typing import Dict, Any, List
import numpy as np

from rag.config import RAGConfig
from rag.embeddings.dense_embedding import get_embedding_provider
from rag.ingestion.pipeline import AdministrativeIngestionOverride, IngestionPipeline
from rag.retrieval.pipeline import RAGPipeline
from rag.schema import RAGQueryRequest
from rag.vector_store.memory_vector_store import PersistentVectorStore

logger = logging.getLogger("wealthgenie.rag.benchmark")


def compute_percentiles(latencies_ms: List[float]) -> Dict[str, float]:
    """Calculates summary statistics and P50, P90, P99 latency percentiles."""
    if not latencies_ms:
        return {"mean": 0.0, "p50": 0.0, "p90": 0.0, "p99": 0.0, "min": 0.0, "max": 0.0}

    arr = np.array(latencies_ms)
    return {
        "count": len(arr),
        "mean_ms": round(float(np.mean(arr)), 2),
        "std_ms": round(float(np.std(arr)), 2),
        "min_ms": round(float(np.min(arr)), 2),
        "p50_ms": round(float(np.percentile(arr, 50)), 2),
        "p90_ms": round(float(np.percentile(arr, 90)), 2),
        "p99_ms": round(float(np.percentile(arr, 99)), 2),
        "max_ms": round(float(np.max(arr)), 2),
    }


class RAGBenchmarkSuite:
    """Benchmark suite for evaluating RAG ingestion throughput and query latency performance."""

    def __init__(self, vector_store_path: Any = None):
        self.config = RAGConfig(embedding_dim=64, similarity_threshold=0.0)
        if vector_store_path:
            self.config.vector_store_path = vector_store_path

        self.embedder = get_embedding_provider(self.config)
        self.vector_store = PersistentVectorStore(index_path=self.config.vector_store_path)
        self.ingestion_pipeline = IngestionPipeline(embedder=self.embedder, vector_store=self.vector_store)
        self.query_pipeline = RAGPipeline(embedder=self.embedder, vector_store=self.vector_store, config=self.config)

    def run_ingestion_benchmark(self, num_docs: int = 10) -> Dict[str, Any]:
        """Measures document ingestion throughput (documents/sec and chunks/sec)."""
        t0 = time.perf_counter()
        total_chunks = 0

        for i in range(num_docs):
            content = f"Financial Document #{i}: Comprehensive tax regulations regarding Section 87A rebate and capital gains tax calculations for investment portfolio {i}."
            res = self.ingestion_pipeline.ingest_text(
                text=content,
                title=f"Doc {i}",
                source=f"synth_{i}.txt",
                administrative_override=AdministrativeIngestionOverride(
                    operator_id="benchmark-suite",
                    reason="Quarantined synthetic content used only for latency benchmarking.",
                ),
            )
            total_chunks += res["chunks_created"]

        total_time = time.perf_counter() - t0
        docs_per_sec = num_docs / total_time if total_time > 0 else 0.0
        chunks_per_sec = total_chunks / total_time if total_time > 0 else 0.0

        return {
            "num_documents": num_docs,
            "total_chunks_created": total_chunks,
            "total_time_seconds": round(total_time, 4),
            "docs_per_second": round(docs_per_sec, 2),
            "chunks_per_second": round(chunks_per_sec, 2),
        }

    def run_query_benchmark(self, num_queries: int = 20) -> Dict[str, Any]:
        """Measures cold cache vs warm cache query latency percentiles and QPS."""
        # Cold Cache Queries
        self.query_pipeline.cache_manager.invalidate_all()
        cold_latencies = []

        for i in range(num_queries):
            q_text = f"Comprehensive tax regulations regarding Section 87A rebate {i % 5}"
            req = RAGQueryRequest(question=q_text)
            t0 = time.perf_counter()
            self.query_pipeline.query(req)
            cold_latencies.append((time.perf_counter() - t0) * 1000.0)

        # Warm Cache Queries (repeating same queries)
        warm_latencies = []
        for i in range(num_queries):
            q_text = f"Comprehensive tax regulations regarding Section 87A rebate {i % 5}"
            req = RAGQueryRequest(question=q_text)
            t0 = time.perf_counter()
            self.query_pipeline.query(req)
            warm_latencies.append((time.perf_counter() - t0) * 1000.0)

        cold_stats = compute_percentiles(cold_latencies)
        warm_stats = compute_percentiles(warm_latencies)

        total_cold_time = sum(cold_latencies) / 1000.0
        cold_qps = num_queries / total_cold_time if total_cold_time > 0 else 0.0

        total_warm_time = sum(warm_latencies) / 1000.0
        warm_qps = num_queries / total_warm_time if total_warm_time > 0 else 0.0

        return {
            "cold_cache": {
                "stats": cold_stats,
                "qps": round(cold_qps, 2),
            },
            "warm_cache": {
                "stats": warm_stats,
                "qps": round(warm_qps, 2),
            },
            "cache_stats": self.query_pipeline.cache_manager.get_cache_stats(),
        }
