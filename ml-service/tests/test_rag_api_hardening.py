"""
WealthGenie RAG Subsystem - API Hardening Test Suite
Tests security headers, sliding window rate limiting, input validation rules, and error payloads.
"""

import os
import pytest
from fastapi.testclient import TestClient
from main import app
from rag.router import _RATE_LIMIT_STORE

@pytest.fixture
def client():
    api_key = os.environ.get("ML_SERVICE_API_KEY", "wealthgenie_secret_api_key_2026")
    with TestClient(app, headers={"X-API-Key": api_key, "X-Verified-User-Id": "test-user-id"}) as c:
        yield c


def test_api_security_headers(client):
    response = client.get("/rag/health")
    assert response.status_code == 200
    assert response.headers.get("X-Content-Type-Options") == "nosniff"
    assert response.headers.get("X-Frame-Options") == "DENY"
    assert response.headers.get("X-XSS-Protection") == "1; mode=block"


def test_short_content_input_validation(client):
    payload = {
        "title": "Short Doc",
        "content": "too short",  # <10 chars
        "source": "api",
    }
    response = client.post("/rag/index", json=payload)
    assert response.status_code == 422  # Unprocessable Entity Pydantic validation


def test_rate_limiting_enforcement(client):
    # Clear rate limit store
    _RATE_LIMIT_STORE.clear()

    # Make 60 rate-limited query requests -> should succeed
    for i in range(60):
        res = client.post("/rag/query", json={"question": f"Test Question {i}"})
        assert res.status_code == 200

    # 61st request from same IP -> Rate limit HTTP 429
    res_overflow = client.post("/rag/query", json={"question": "Overflow question"})
    assert res_overflow.status_code == 429
    assert "Rate limit exceeded" in res_overflow.json()["detail"]

    # Cleanup rate limit store after test
    _RATE_LIMIT_STORE.clear()
