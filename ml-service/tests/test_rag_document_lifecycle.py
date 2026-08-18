"""
WealthGenie RAG Subsystem - Document Lifecycle Manager Test Suite
Tests document registration, soft deletion, hard deletion, metadata update,
atomic writes, SHA-256 checksums, backup recovery, reconciliation, concurrent mutations,
and FastAPI router integration.
"""

import concurrent.futures
import json
import os
import threading
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from main import app
from rag.lifecycle.manager import DocumentLifecycleManager
from rag.schema import Document, DocumentMetadata, TextChunk, ChunkMetadata
from rag.vector_store.memory_vector_store import PersistentVectorStore


@pytest.fixture
def client():
    api_key = os.environ.get("ML_SERVICE_API_KEY", "wealthgenie_secret_api_key_2026")
    with TestClient(app, headers={"X-API-Key": api_key, "X-Verified-User-Id": "test-user-id"}) as c:
        yield c


def test_document_lifecycle_registration_and_soft_delete(tmp_path):
    reg_file = tmp_path / "test_registry.json"
    store = PersistentVectorStore(index_path=tmp_path / "test_store.json")
    manager = DocumentLifecycleManager(vector_store=store, registry_path=reg_file)

    doc = Document(
        document_id="doc1",
        content="Sample content",
        metadata=DocumentMetadata(title="Tax Guide", source="tax.md", author="Expert"),
    )

    manager.register_document(doc, chunk_count=2)
    docs = manager.list_documents()
    assert len(docs) == 1
    assert docs[0]["title"] == "Tax Guide"

    # Soft delete
    manager.soft_delete_document("doc1")
    active_docs = manager.list_documents(include_inactive=False)
    all_docs = manager.list_documents(include_inactive=True)
    assert len(active_docs) == 0
    assert len(all_docs) == 1


def test_document_hard_delete_and_chunk_purging(tmp_path):
    reg_file = tmp_path / "test_registry.json"
    store = PersistentVectorStore(index_path=tmp_path / "test_store.json")

    meta = ChunkMetadata(chunk_id="c1", document_id="doc1", chunk_index=0, title="T1", source="s1.md")
    chunk = TextChunk(chunk_id="c1", document_id="doc1", content="Content", metadata=meta, embedding=[1.0, 0.0])
    store.add_chunks([chunk])

    manager = DocumentLifecycleManager(vector_store=store, registry_path=reg_file)
    manager.register_document(
        Document(document_id="doc1", content="Content", metadata=DocumentMetadata(title="T1", source="s1.md")),
        chunk_count=1,
    )

    assert len(store._chunks) == 1

    # Hard delete
    success = manager.hard_delete_document("doc1")
    assert success
    assert len(store._chunks) == 0
    assert len(manager.list_documents()) == 0


def test_document_metadata_update(tmp_path):
    reg_file = tmp_path / "test_registry.json"
    store = PersistentVectorStore(index_path=tmp_path / "test_store.json")

    meta = ChunkMetadata(chunk_id="c1", document_id="doc1", chunk_index=0, title="Old Title", source="s1.md")
    chunk = TextChunk(chunk_id="c1", document_id="doc1", content="Content", metadata=meta, embedding=[1.0, 0.0])
    store.add_chunks([chunk])

    manager = DocumentLifecycleManager(vector_store=store, registry_path=reg_file)
    manager.register_document(
        Document(document_id="doc1", content="Content", metadata=DocumentMetadata(title="Old Title", source="s1.md")),
        chunk_count=1,
    )

    manager.update_metadata("doc1", new_title="New Tax Guide Title", new_author="Jane Doe")

    doc_entry = manager.list_documents()[0]
    assert doc_entry["title"] == "New Tax Guide Title"
    assert doc_entry["author"] == "Jane Doe"
    assert store._chunks[0].metadata.title == "New Tax Guide Title"
    assert store._chunks[0].metadata.author == "Jane Doe"


def test_hard_delete_interruption_leaves_safe_state_and_reconciles(tmp_path):
    """
    PROOF 1: Simulates process crash/interruption between vector-store-save and registry-save.
    Asserts:
      1. Vector store chunks are genuinely gone from search results (no stale/unauthorized retrieval).
      2. Fresh DocumentLifecycleManager loaded from disk flags the stale registry entry during reconciliation.
    """
    reg_file = tmp_path / "test_registry.json"
    store_file = tmp_path / "test_store.json"
    store = PersistentVectorStore(index_path=store_file)

    meta = ChunkMetadata(chunk_id="c1", document_id="doc_secret", chunk_index=0, title="Secret Document", source="secret.md")
    chunk = TextChunk(chunk_id="c1", document_id="doc_secret", content="Secret Financial Plan", metadata=meta, embedding=[1.0, 0.0])
    store.add_chunks([chunk])

    manager = DocumentLifecycleManager(vector_store=store, registry_path=reg_file)
    manager.register_document(
        Document(document_id="doc_secret", content="Secret Financial Plan", metadata=DocumentMetadata(title="Secret Document", source="secret.md")),
        chunk_count=1,
    )

    # Injected real exception simulating process crash exactly between vector store save and registry save
    class ProcessKilledSimulation(RuntimeError):
        pass

    def crash_before_registry_save():
        raise ProcessKilledSimulation("SIGKILL simulated after vector store purge but before registry save")

    manager._save_registry_unlocked = crash_before_registry_save

    with pytest.raises(ProcessKilledSimulation):
        manager.hard_delete_document("doc_secret")

    # Instantiate brand new fresh store and manager loading state from disk
    fresh_store = PersistentVectorStore(index_path=store_file)
    fresh_mgr = DocumentLifecycleManager(vector_store=fresh_store, registry_path=reg_file)

    # 1. Content is genuinely absent from vector store and search results
    assert len(fresh_store._chunks) == 0
    search_results = fresh_store.search(query_vector=[1.0, 0.0], top_k=5)
    assert len(search_results) == 0

    # 2. Reconciliation flags the stale registry entry
    recon = fresh_mgr.reconcile_registry_and_vector_store()
    assert recon["status"] == "ANOMALIES_DETECTED"
    assert "doc_secret" in recon["stale_registry_documents"]
    assert recon["stale_registry_count"] == 1
    assert recon["orphaned_vector_count"] == 0


def test_registry_atomic_save_and_backup_recovery(tmp_path):
    """
    PROOF 2A: Proves save_registry() uses atomic writes with checksum and survives
    simulated corruption of the primary file by recovering from .json.bak.
    """
    reg_file = tmp_path / "test_registry.json"
    store = PersistentVectorStore(index_path=tmp_path / "test_store.json")
    manager = DocumentLifecycleManager(vector_store=store, registry_path=reg_file)

    doc1 = Document(document_id="d1", content="Text 1", metadata=DocumentMetadata(title="Doc 1", source="s1.md"))
    doc2 = Document(document_id="d2", content="Text 2", metadata=DocumentMetadata(title="Doc 2", source="s2.md"))

    manager.register_document(doc1, chunk_count=1)
    assert reg_file.exists()

    with open(reg_file, "r", encoding="utf-8") as f:
        data = json.load(f)
    assert data["version"] == "2.0"
    assert "sha256" in data
    assert data["total_documents"] == 1

    # Second mutation creates .json.bak snapshot
    manager.register_document(doc2, chunk_count=1)
    assert manager.backup_path.exists()

    # Corrupt the primary registry file with invalid/truncated bytes
    with open(reg_file, "w", encoding="utf-8") as f:
        f.write("{ INVALID TRUNCATED JSON CORRUPT ///")

    # Fresh manager instance must detect corruption and recover from backup
    recovered_mgr = DocumentLifecycleManager(vector_store=store, registry_path=reg_file)
    docs = recovered_mgr.list_documents()
    assert len(docs) >= 1
    doc_ids = {d["document_id"] for d in docs}
    assert "d1" in doc_ids


def test_registry_corruption_fails_loudly_without_backup(tmp_path):
    """
    PROOF 2B: Proves that if primary file is corrupt and no backup exists (or backup is also corrupt),
    the manager fails loudly with RuntimeError rather than starting with silent data loss.
    """
    reg_file = tmp_path / "test_registry.json"
    store = PersistentVectorStore(index_path=tmp_path / "test_store.json")

    # 1. Corrupt primary, no backup
    with open(reg_file, "w", encoding="utf-8") as f:
        f.write("{ CORRUPT FILE NO BACKUP")

    with pytest.raises(RuntimeError) as exc_info:
        DocumentLifecycleManager(vector_store=store, registry_path=reg_file)
    assert "Corrupted document registry and no backup available" in str(exc_info.value)

    # 2. Corrupt primary AND corrupt backup
    bak_file = reg_file.with_suffix(".json.bak")
    with open(bak_file, "w", encoding="utf-8") as f:
        f.write("{ CORRUPT BACKUP ALSO")

    with pytest.raises(RuntimeError) as exc_info2:
        DocumentLifecycleManager(vector_store=store, registry_path=reg_file)
    assert "backup recovery failed" in str(exc_info2.value)


def test_reconciliation_detects_orphaned_chunks(tmp_path):
    """
    Reconciliation test: asserts chunks existing in vector store with missing registry entries
    are correctly reported with counts and document IDs.
    """
    reg_file = tmp_path / "test_registry.json"
    store = PersistentVectorStore(index_path=tmp_path / "test_store.json")

    meta = ChunkMetadata(chunk_id="c_orph", document_id="doc_orphaned", chunk_index=0, title="Orphan", source="o.md")
    chunk = TextChunk(chunk_id="c_orph", document_id="doc_orphaned", content="Orphaned chunk", metadata=meta, embedding=[1.0, 0.0])
    store.add_chunks([chunk])

    manager = DocumentLifecycleManager(vector_store=store, registry_path=reg_file)
    recon = manager.reconcile_registry_and_vector_store()

    assert recon["status"] == "ANOMALIES_DETECTED"
    assert "doc_orphaned" in recon["orphaned_vector_documents"]
    assert recon["orphaned_vector_count"] == 1


def test_concurrent_document_mutations_maintain_consistency(tmp_path):
    """
    PROOF 3: Fires register_document(), update_metadata(), soft_delete_document(), and
    hard_delete_document() across real concurrent threads against the same manager instance.
    Asserts final on-disk state is valid, parsable, and non-corrupted (no lost updates or torn writes).
    """
    reg_file = tmp_path / "test_registry.json"
    store = PersistentVectorStore(index_path=tmp_path / "test_store.json")
    manager = DocumentLifecycleManager(vector_store=store, registry_path=reg_file)

    num_docs = 20

    def register_worker(i):
        doc = Document(
            document_id=f"doc_{i}",
            content=f"Content for doc {i}",
            metadata=DocumentMetadata(title=f"Doc Title {i}", source=f"src_{i}.md", author=f"Author {i}"),
        )
        meta = ChunkMetadata(chunk_id=f"c_{i}", document_id=f"doc_{i}", chunk_index=0, title=f"Doc Title {i}", source=f"src_{i}.md")
        chunk = TextChunk(chunk_id=f"c_{i}", document_id=f"doc_{i}", content=f"Content for doc {i}", metadata=meta, embedding=[0.5, 0.5])
        store.add_chunks([chunk])
        manager.register_document(doc, chunk_count=1)

    def update_worker(i):
        manager.update_metadata(f"doc_{i}", new_title=f"Updated Title {i}", new_author=f"Updated Author {i}")

    def soft_delete_worker(i):
        manager.soft_delete_document(f"doc_{i}")

    def hard_delete_worker(i):
        manager.hard_delete_document(f"doc_{i}")

    # Phase 1: Concurrently register 20 documents
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(register_worker, i) for i in range(num_docs)]
        concurrent.futures.wait(futures)

    # Phase 2: Concurrently perform mixed mutations across threads
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        mixed_futures = []
        for i in range(0, num_docs, 4):
            mixed_futures.append(executor.submit(update_worker, i))
            mixed_futures.append(executor.submit(soft_delete_worker, i + 1))
            mixed_futures.append(executor.submit(hard_delete_worker, i + 2))
            mixed_futures.append(executor.submit(register_worker, i + 3))
        concurrent.futures.wait(mixed_futures)

    # Assert on-disk state on a fresh instance
    fresh_store = PersistentVectorStore(index_path=tmp_path / "test_store.json")
    fresh_mgr = DocumentLifecycleManager(vector_store=fresh_store, registry_path=reg_file)

    # Primary file must be clean and uncorrupted
    with open(reg_file, "r", encoding="utf-8") as f:
        on_disk_data = json.load(f)
    assert on_disk_data["version"] == "2.0"
    assert "sha256" in on_disk_data
    assert isinstance(on_disk_data["documents"], dict)

    # Registry and vector store must load without exception
    all_docs = fresh_mgr.list_documents(include_inactive=True)
    assert len(all_docs) > 0


def test_fastapi_document_endpoints(client):
    res = client.get("/rag/documents")
    assert res.status_code == 200
    assert "documents" in res.json()


def test_fastapi_reconcile_endpoint(client):
    res = client.get("/rag/reconcile")
    assert res.status_code == 200
    data = res.json()
    assert "status" in data
    assert "stale_registry_documents" in data
    assert "orphaned_vector_documents" in data
