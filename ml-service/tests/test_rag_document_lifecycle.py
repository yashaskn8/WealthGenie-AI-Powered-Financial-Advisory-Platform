"""
WealthGenie RAG Subsystem - Document Lifecycle Manager Test Suite
Tests document registration, soft deletion, hard deletion, metadata update, and FastAPI router integration.
"""

from fastapi.testclient import TestClient
from main import app
from rag.lifecycle.manager import DocumentLifecycleManager
from rag.schema import Document, DocumentMetadata, TextChunk, ChunkMetadata
from rag.vector_store.memory_vector_store import PersistentVectorStore

client = TestClient(app)


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


def test_fastapi_document_endpoints():
    res = client.get("/rag/documents")
    assert res.status_code == 200
    assert "documents" in res.json()
