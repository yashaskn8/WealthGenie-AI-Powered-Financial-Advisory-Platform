"""
WealthGenie RAG Subsystem - Multi-Tenant Isolation Test Suite
Verifies strict tenant data boundary guarantees across vector store search, retrievers, and RAGPipeline.
"""

from rag.config import RAGConfig
from rag.embeddings.dense_embedding import DenseVectorEmbeddingProvider
from rag.retrievers.dense_retriever import DenseRetriever
from rag.retrievers.hybrid_retriever import HybridRetriever
from rag.retrieval.pipeline import RAGPipeline
from rag.schema import TextChunk, ChunkMetadata, RAGQueryRequest
from rag.vector_store.memory_vector_store import PersistentVectorStore


def test_multi_tenant_vector_store_isolation(tmp_path):
    store = PersistentVectorStore(index_path=tmp_path / "tenant_index.json")
    embedder = DenseVectorEmbeddingProvider(dimension=64, enable_cache=False)

    vec_a = embedder.embed_text("Tenant A confidential tax details.")
    vec_b = embedder.embed_text("Tenant B confidential investment details.")

    # Tenant A Chunk
    meta_a = ChunkMetadata(chunk_id="ca1", document_id="da1", chunk_index=0, title="Tenant A Secret", source="a.md", tenant_id="tenant_A")
    chunk_a = TextChunk(chunk_id="ca1", document_id="da1", content="Tenant A confidential tax details.", metadata=meta_a, tenant_id="tenant_A", embedding=vec_a)

    # Tenant B Chunk
    meta_b = ChunkMetadata(chunk_id="cb1", document_id="db1", chunk_index=0, title="Tenant B Secret", source="b.md", tenant_id="tenant_B")
    chunk_b = TextChunk(chunk_id="cb1", document_id="db1", content="Tenant B confidential investment details.", metadata=meta_b, tenant_id="tenant_B", embedding=vec_b)

    store.add_chunks([chunk_a, chunk_b])

    # Search for Tenant A -> Must NOT retrieve Tenant B chunk
    results_a = store.search(vec_a, top_k=5, tenant_id="tenant_A")
    assert len(results_a) == 1
    assert results_a[0].chunk.chunk_id == "ca1"

    # Search for Tenant B -> Must NOT retrieve Tenant A chunk
    results_b = store.search(vec_b, top_k=5, tenant_id="tenant_B")
    assert len(results_b) == 1
    assert results_b[0].chunk.chunk_id == "cb1"


def test_multi_tenant_hybrid_retriever(tmp_path):
    store = PersistentVectorStore(index_path=tmp_path / "tenant_index.json")
    embedder = DenseVectorEmbeddingProvider(dimension=64, enable_cache=False)

    vec_a = embedder.embed_text("Section 87A rebate for tenant A")
    vec_b = embedder.embed_text("Section 87A rebate for tenant B")

    meta_a = ChunkMetadata(chunk_id="ca1", document_id="da1", chunk_index=0, title="Tax A", source="a.md", tenant_id="tenant_A")
    chunk_a = TextChunk(chunk_id="ca1", document_id="da1", content="Section 87A rebate for tenant A", metadata=meta_a, tenant_id="tenant_A", embedding=vec_a)

    meta_b = ChunkMetadata(chunk_id="cb1", document_id="db1", chunk_index=0, title="Tax B", source="b.md", tenant_id="tenant_B")
    chunk_b = TextChunk(chunk_id="cb1", document_id="db1", content="Section 87A rebate for tenant B", metadata=meta_b, tenant_id="tenant_B", embedding=vec_b)

    store.add_chunks([chunk_a, chunk_b])

    retriever = HybridRetriever(dense_retriever=DenseRetriever(embedder=embedder, vector_store=store))
    results = retriever.retrieve("Section 87A rebate for tenant A", top_k=5, tenant_id="tenant_A")

    assert len(results) == 1
    assert results[0].chunk.tenant_id == "tenant_A"


def test_multi_tenant_pipeline_query_isolation(tmp_path):
    config = RAGConfig(vector_store_path=tmp_path / "pipeline_tenant_index.json", embedding_dim=64, similarity_threshold=0.0)
    embedder = DenseVectorEmbeddingProvider(dimension=64, enable_cache=False)
    store = PersistentVectorStore(index_path=config.vector_store_path)

    vec_a = embedder.embed_text("Org Alpha financial policy details")

    meta_a = ChunkMetadata(chunk_id="ca1", document_id="da1", chunk_index=0, title="Org A Report", source="a.md", tenant_id="org_alpha")
    chunk_a = TextChunk(chunk_id="ca1", document_id="da1", content="Org Alpha financial policy details", metadata=meta_a, tenant_id="org_alpha", embedding=vec_a)

    store.add_chunks([chunk_a])

    pipeline = RAGPipeline(embedder=embedder, vector_store=store, config=config)

    # Request from Org Beta -> Zero chunks retrieved
    req_beta = RAGQueryRequest(question="Org Alpha financial policy details", tenant_id="org_beta")
    res_beta = pipeline.query(req_beta)
    assert not res_beta.grounded
    assert len(res_beta.retrieved_chunks) == 0

    # Request from Org Alpha -> Grounded retrieval success
    req_alpha = RAGQueryRequest(question="Org Alpha financial policy details", tenant_id="org_alpha")
    res_alpha = pipeline.query(req_alpha)
    assert res_alpha.grounded
    assert len(res_alpha.retrieved_chunks) == 1
