"""
WealthGenie ML Microservice - Router Authentication Hardening Test Suite
Verifies closing of anonymous-access gap on /rag and /llm routers and audits tenant scoping.
"""

import os
import pytest
from fastapi.testclient import TestClient
from main import app

API_KEY = "wealthgenie_secret_api_key_2026"


@pytest.fixture(autouse=True)
def ensure_auth_environment(monkeypatch):
    """Ensure tests run with valid API key configured and non-local environment by default."""
    monkeypatch.setenv("ML_SERVICE_API_KEY", API_KEY)
    monkeypatch.setenv("ENVIRONMENT", "production")


# ==============================================================================
# 1. RAG ROUTER AUTHENTICATION TESTS (Anonymous Rejection & Valid Key Acceptance)
# ==============================================================================

def test_rag_index_rejects_unauthenticated_request():
    """POST /rag/index MUST return 401 when called anonymously without X-API-Key."""
    with TestClient(app) as client:
        payload = {
            "title": "Unauthenticated Guide",
            "content": "Confidential financial regulations that should not be indexed anonymously.",
            "source": "attacker",
        }
        res = client.post("/rag/index", json=payload)
        assert res.status_code == 401, f"Expected 401 Unauthorized, got {res.status_code}"
        assert res.json()["detail"] == "Invalid or missing API Key"


def test_rag_query_rejects_unauthenticated_request():
    """POST /rag/query MUST return 401 when called anonymously without X-API-Key."""
    with TestClient(app) as client:
        res = client.post("/rag/query", json={"question": "What are Section 80C limits?"})
        assert res.status_code == 401, f"Expected 401 Unauthorized, got {res.status_code}"
        assert res.json()["detail"] == "Invalid or missing API Key"


def test_rag_documents_delete_rejects_unauthenticated_request():
    """DELETE /rag/documents/{id} MUST return 401 when called anonymously without X-API-Key."""
    with TestClient(app) as client:
        res = client.delete("/rag/documents/doc-secret-123")
        assert res.status_code == 401, f"Expected 401 Unauthorized, got {res.status_code}"
        assert res.json()["detail"] == "Invalid or missing API Key"


def test_rag_documents_put_rejects_unauthenticated_request():
    """PUT /rag/documents/{id} MUST return 401 when called anonymously without X-API-Key."""
    with TestClient(app) as client:
        res = client.put("/rag/documents/doc-secret-123", params={"title": "Tampered Title"})
        assert res.status_code == 401, f"Expected 401 Unauthorized, got {res.status_code}"
        assert res.json()["detail"] == "Invalid or missing API Key"


def test_rag_routes_succeed_with_valid_api_key():
    """RAG routes MUST succeed when provided with a valid X-API-Key header."""
    headers = {"X-API-Key": API_KEY}
    with TestClient(app, headers=headers) as client:
        # Health
        res_health = client.get("/rag/health")
        assert res_health.status_code == 200
        assert res_health.json()["status"] == "ok"

        # Status
        res_status = client.get("/rag/status")
        assert res_status.status_code == 200
        assert "vector_store_stats" in res_status.json()

        # Documents list
        res_docs = client.get("/rag/documents")
        assert res_docs.status_code == 200
        assert "documents" in res_docs.json()


# ==============================================================================
# 2. LLM ROUTER AUTHENTICATION TESTS (Anonymous Rejection & Valid Key Acceptance)
# ==============================================================================

def test_llm_generate_rejects_unauthenticated_request():
    """POST /llm/generate MUST return 401 when called anonymously without X-API-Key."""
    with TestClient(app) as client:
        res = client.post("/llm/generate", json={"prompt": "Generate unauthorized advice."})
        assert res.status_code == 401, f"Expected 401 Unauthorized, got {res.status_code}"
        assert res.json()["detail"] == "Invalid or missing API Key"


def test_llm_batch_generate_rejects_unauthenticated_request():
    """POST /llm/batch-generate MUST return 401 when called anonymously without X-API-Key."""
    with TestClient(app) as client:
        res = client.post("/llm/batch-generate", json=[{"prompt": "Query 1"}, {"prompt": "Query 2"}])
        assert res.status_code == 401, f"Expected 401 Unauthorized, got {res.status_code}"
        assert res.json()["detail"] == "Invalid or missing API Key"


def test_llm_rag_query_rejects_unauthenticated_request():
    """POST /llm/rag-query MUST return 401 when called anonymously without X-API-Key."""
    with TestClient(app) as client:
        res = client.post("/llm/rag-query", json={"question": "What is Section 87A?"})
        assert res.status_code == 401, f"Expected 401 Unauthorized, got {res.status_code}"
        assert res.json()["detail"] == "Invalid or missing API Key"


def test_llm_tool_query_rejects_unauthenticated_request():
    """POST /llm/tool-query MUST return 401 when called anonymously without X-API-Key."""
    with TestClient(app) as client:
        res = client.post("/llm/tool-query", json={"tool_name": "calculate_sip", "arguments": {}})
        assert res.status_code == 401, f"Expected 401 Unauthorized, got {res.status_code}"
        assert res.json()["detail"] == "Invalid or missing API Key"


def test_llm_switch_rejects_unauthenticated_request():
    """POST /llm/switch MUST return 401 when called anonymously without X-API-Key."""
    with TestClient(app) as client:
        res = client.post("/llm/switch", json={"provider_key": "mock"})
        assert res.status_code == 401, f"Expected 401 Unauthorized, got {res.status_code}"
        assert res.json()["detail"] == "Invalid or missing API Key"


def test_llm_routes_succeed_with_valid_api_key():
    """LLM routes MUST succeed when provided with a valid X-API-Key header."""
    headers = {"X-API-Key": API_KEY}
    with TestClient(app, headers=headers) as client:
        # Health
        res_health = client.get("/llm/health")
        assert res_health.status_code == 200
        assert res_health.json()["status"] in ("ok", "degraded")

        # Status
        res_status = client.get("/llm/status")
        assert res_status.status_code == 200
        assert "active_model_metadata" in res_status.json()

        # Tools
        res_tools = client.get("/llm/tools")
        assert res_tools.status_code == 200
        assert "tools" in res_tools.json()


# ==============================================================================
# 3. TIMING-ATTACK RESISTANT INVALID KEY & FAIL-CLOSED GUARDS
# ==============================================================================

def test_invalid_api_key_rejected_on_all_subsystems():
    """Invalid API key must return 401 on /rag, /llm, and /model/registry."""
    bad_headers = {"X-API-Key": "invalid_random_attacker_key_123"}
    with TestClient(app, headers=bad_headers) as client:
        assert client.post("/rag/query", json={"question": "test"}).status_code == 401
        assert client.post("/llm/generate", json={"prompt": "test"}).status_code == 401
        assert client.get("/model/registry/versions").status_code == 401


def test_fail_closed_when_api_key_unset_in_production(monkeypatch):
    """When ML_SERVICE_API_KEY is unset in production, all routers fail closed with HTTP 500."""
    monkeypatch.delenv("ML_SERVICE_API_KEY", raising=False)
    monkeypatch.setenv("ENVIRONMENT", "production")

    with TestClient(app) as client:
        res_rag = client.post("/rag/query", json={"question": "test"})
        assert res_rag.status_code == 500
        assert "Server Misconfiguration" in res_rag.json()["detail"]

        res_llm = client.post("/llm/generate", json={"prompt": "test"})
        assert res_llm.status_code == 500
        assert "Server Misconfiguration" in res_llm.json()["detail"]


# ==============================================================================
# 4. TASK 2 — TENANT & USER SCOPE TRUST AUDIT
# ==============================================================================

def test_task2_tenant_id_in_request_body_audit():
    """
    Documents the Task 2 finding:
    IngestTextRequest accepts `tenant_id` and `user_id` as unverified body fields.
    With a valid service API key, any caller can submit an arbitrary tenant_id.
    """
    headers = {"X-API-Key": API_KEY}
    with TestClient(app, headers=headers) as client:
        payload = {
            "title": "Tenant Boundary Audit Document",
            "content": "Tenant scoped financial advisory document for tenant isolation verification.",
            "source": "audit_test",
            "tenant_id": "arbitrary_unverified_tenant_xyz",
            "user_id": "arbitrary_unverified_user_999",
        }
        res = client.post("/rag/index", json=payload)
        # Succeeded because service API key authenticated the caller, but tenant_id is caller-declared
        assert res.status_code == 200
        assert res.json()["status"] == "success"
        res_data = res.json()["ingestion_result"]
        assert res_data["status"] == "success"
        assert res_data["chunks_created"] > 0
