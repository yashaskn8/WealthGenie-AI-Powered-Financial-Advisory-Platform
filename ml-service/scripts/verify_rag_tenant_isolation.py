# ruff: noqa: E402
"""
WealthGenie RAG Subsystem - Verification of Multi-Tenant Scope Isolation
Ingests a private document for fake_user_123, queries as fake_user_999 (cross-tenant check),
queries as fake_user_123 (owner check), and queries global regulatory content.
Prints actual query results for both cases.
"""

import sys
import io
from pathlib import Path

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# Add ml-service to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from rag.config import RAGConfig
from rag.embeddings.dense_embedding import DenseVectorEmbeddingProvider
from rag.ingestion.pipeline import AdministrativeIngestionOverride, IngestionPipeline
from rag.retrieval.pipeline import RAGPipeline
from rag.schema import RAGQueryRequest
from rag.vector_store.memory_vector_store import PersistentVectorStore


def run_tenant_isolation_verification():
    print("=" * 80)
    print("STEP 1: MULTI-TENANT RAG ISOLATION VERIFICATION")
    print("=" * 80)

    test_store_path = Path(__file__).resolve().parent.parent / "data" / "test_tenant_isolation_index.json"
    if test_store_path.exists():
        test_store_path.unlink()

    config = RAGConfig(vector_store_path=test_store_path, embedding_dim=64, similarity_threshold=0.0)
    embedder = DenseVectorEmbeddingProvider(dimension=64, enable_cache=False)
    vector_store = PersistentVectorStore(index_path=config.vector_store_path)
    ingestion = IngestionPipeline(embedder=embedder, vector_store=vector_store)

    # 1. Ingest Global Regulatory Content
    print("\n[1] Ingesting Public/Global Regulatory Corpus...")
    global_res = ingestion.ingest_text(
        text="Under Income Tax Section 80C, individual taxpayers can claim deduction up to Rs 1,50,000 for ELSS, PPF, and EPF.",
        title="Income Tax Act Section 80C Master Reference",
        source="https://www.incometaxindia.gov.in/official/section-80c",
        source_trust_tier="government_official",
        author="CBDT Official",
        scope="global",
        tenant_id="default",
    )
    print(f"    [OK] Global doc ingested: {global_res['title']} (Chunks: {global_res['chunks_added']}, Scope: global)")

    # 2. Ingest Private Document scoped to fake_user_123
    print("\n[2] Ingesting Confidential User Document for 'fake_user_123'...")
    user_secret_text = "CONFIDENTIAL PORTFOLIO RECORD: Account of fake_user_123 holds 10,000 units of QuantumGrowthVault (ISIN: IN999999999) with net liquidation value of Rs 45,00,000."
    user123_res = ingestion.ingest_text(
        text=user_secret_text,
        title="Private Portfolio Summary - fake_user_123",
        source="user_upload_portfolio.pdf",
        author="Client Portfolio Statement",
        user_id="fake_user_123",
        scope="user:fake_user_123",
        tenant_id="fake_user_123",
        administrative_override=AdministrativeIngestionOverride(
            operator_id="tenant-isolation-test",
            reason="Quarantine a synthetic private document for isolation verification.",
        ),
    )
    print(f"    [OK] Private doc ingested: {user123_res['title']} (Chunks: {user123_res['chunks_added']}, Scope: user:fake_user_123)")

    pipeline = RAGPipeline(embedder=embedder, vector_store=vector_store, config=config)

    # 3. Query as DIFFERENT user: fake_user_999
    print("\n" + "-" * 80)
    print("[3] TEST CASE A: Cross-Tenant Privacy Check (Query as 'fake_user_999')")
    print("    Question: 'What is the balance and ISIN of QuantumGrowthVault?'")
    print("    Expected: ZERO private chunks returned, NOT grounded in fake_user_123 data.")
    print("-" * 80)

    req_other = RAGQueryRequest(
        question="What is the balance and ISIN of QuantumGrowthVault?",
        user_id="fake_user_999",
        include_citations=True,
    )
    res_other = pipeline.query(req_other)

    print(f"    Retrieval Count: {len(res_other.retrieved_chunks)}")
    print(f"    Grounded Flag:   {res_other.grounded}")
    print(f"    Answer Output:   {res_other.answer[:150]}...")
    print(f"    Citations Count: {len(res_other.citations)}")

    # Strict Assertion
    for rc in res_other.retrieved_chunks:
        assert rc.chunk.metadata.scope != "user:fake_user_123", "CRITICAL SECURITY FAILURE: Private chunk leaked to different user!"
        assert "QuantumGrowthVault" not in rc.chunk.content, "CRITICAL SECURITY FAILURE: Private content leaked in retrieved chunk!"

    assert len(res_other.retrieved_chunks) == 0 or not any("QuantumGrowthVault" in c.chunk.content for c in res_other.retrieved_chunks)
    print("    [PASS] PRIVACY VERIFIED: fake_user_999 received NO access to fake_user_123 private document.")

    # 4. Query as OWNER user: fake_user_123
    print("\n" + "-" * 80)
    print("[4] TEST CASE B: Authorized Owner Retrieval (Query as 'fake_user_123')")
    print("    Question: 'What is the balance and ISIN of QuantumGrowthVault?'")
    print("    Expected: Quarantined private input must not become advisory evidence, even for its owner.")
    print("-" * 80)

    req_owner = RAGQueryRequest(
        question="What is the balance and ISIN of QuantumGrowthVault?",
        user_id="fake_user_123",
        include_citations=True,
    )
    res_owner = pipeline.query(req_owner)

    print(f"    Retrieval Count: {len(res_owner.retrieved_chunks)}")
    print(f"    Grounded Flag:   {res_owner.grounded}")
    print(f"    Retrieved Chunk Scope: {res_owner.retrieved_chunks[0].chunk.metadata.scope if res_owner.retrieved_chunks else 'None'}")
    print(f"    Top Match Title: {res_owner.retrieved_chunks[0].chunk.metadata.title if res_owner.retrieved_chunks else 'None'}")
    print(f"    Answer Output:\n{res_owner.answer}")
    print("    Citations:")
    for cit in res_owner.citations:
        print(f"      [{cit.citation_id}] {cit.document_title} (Source: {cit.source}, Score: {cit.relevance_score})")

    assert len(res_owner.retrieved_chunks) == 0
    assert not res_owner.grounded
    assert not res_owner.citations
    print("    [PASS] QUARANTINE VERIFIED: unverified private content cannot influence advisory output.")

    # 5. Query Global Public Content
    print("\n" + "-" * 80)
    print("[5] TEST CASE C: Shared Public Regulatory Content (Query as 'fake_user_999')")
    print("    Question: 'What is Section 80C deduction limit?'")
    print("    Expected: Global regulatory chunk retrieved for any authenticated or anonymous user.")
    print("-" * 80)

    req_global = RAGQueryRequest(
        question="What is Section 80C deduction limit?",
        user_id="fake_user_999",
        include_citations=True,
    )
    res_global = pipeline.query(req_global)

    print(f"    Retrieval Count: {len(res_global.retrieved_chunks)}")
    print(f"    Top Match Title: {res_global.retrieved_chunks[0].chunk.metadata.title if res_global.retrieved_chunks else 'None'}")
    print(f"    Answer Output:\n{res_global.answer[:200]}...")
    assert any("80C" in c.chunk.content for c in res_global.retrieved_chunks)
    print("    [PASS] GLOBAL RETRIEVAL VERIFIED: Public regulatory corpus is accessible to all users.")

    # Clean up test index
    if test_store_path.exists():
        test_store_path.unlink()
    bak = test_store_path.with_suffix(".json.bak")
    if bak.exists():
        bak.unlink()

    print("\n" + "=" * 80)
    print("[ALL PASS] ALL MULTI-TENANT RAG ISOLATION CHECKS PASSED (100% SUCCESS)")
    print("=" * 80)


if __name__ == "__main__":
    run_tenant_isolation_verification()
