"""
WealthGenie Production Open-Weight LLM Platform - Infrastructure Test Suite (Phase 3.1)
Tests LLMConfig, Providers (Mock, API, HF), Local Loader, Model Registry, and FastAPI endpoints.
"""

import pytest
from fastapi.testclient import TestClient
from main import app
from llm.config import LLMConfig
from llm.providers.api_provider import APILLMProvider
from llm.providers.huggingface_provider import HuggingFaceLLMProvider
from llm.providers.local_loader import LocalLLMLoader
from llm.providers.mock_provider import MockLLMProvider
from llm.registry import LLMModelRegistry, llm_registry
from llm.schema import LLMGenerateRequest, LLMProviderType

client = TestClient(app)


def test_llm_config_defaults_and_env(monkeypatch):
    config = LLMConfig()
    assert config.default_provider in ("mock", "huggingface", "api", "local")
    assert config.max_new_tokens == 512

    monkeypatch.setenv("LLM_DEFAULT_PROVIDER", "huggingface")
    monkeypatch.setenv("LLM_MAX_NEW_TOKENS", "1024")
    env_config = LLMConfig.from_env()
    assert env_config.default_provider == "huggingface"
    assert env_config.max_new_tokens == 1024


def test_mock_llm_provider():
    provider = MockLLMProvider(model_name="Test-Mock-0.5B")
    assert provider.is_healthy()

    meta = provider.get_metadata()
    assert meta.model_name == "Test-Mock-0.5B"
    assert meta.provider == LLMProviderType.MOCK

    req = LLMGenerateRequest(prompt="What is Section 87A rebate?")
    res = provider.generate(req)
    assert "Section 87A" in res.text
    assert res.completion_tokens > 0
    assert res.provider == "mock"

    stream_tokens = list(provider.generate_stream(req))
    assert len(stream_tokens) > 0


def test_api_llm_provider():
    provider = APILLMProvider(model_name="Test-API-Model")
    assert provider.is_healthy()

    req = LLMGenerateRequest(prompt="Portfolio allocation rules")
    res = provider.generate(req)
    assert res.provider == "api"
    assert "Portfolio" in res.text or "financial" in res.text.lower()


def test_huggingface_llm_provider_fallback():
    provider = HuggingFaceLLMProvider(model_id="Qwen/Qwen2.5-0.5B-Instruct", device="cpu")
    assert provider.is_healthy()

    meta = provider.get_metadata()
    assert meta.model_name == "Qwen/Qwen2.5-0.5B-Instruct"

    req = LLMGenerateRequest(prompt="Income tax slabs 2026")
    res = provider.generate(req)
    assert len(res.text) > 0


def test_local_llm_loader():
    provider = LocalLLMLoader.load_provider(provider_type="mock", model_id="Local-Mock-1B")
    assert provider.get_metadata().model_name == "Local-Mock-1B"


def test_llm_model_registry():
    registry = LLMModelRegistry()
    mock_p = MockLLMProvider(model_name="Reg-Mock")
    api_p = APILLMProvider(model_name="Reg-API")

    registry.register_provider("reg_mock", mock_p, make_active=True)
    registry.register_provider("reg_api", api_p)

    assert registry.get_active_provider().get_metadata().model_name == "Reg-Mock"

    registry.set_active_provider("reg_api")
    assert registry.get_active_provider().get_metadata().model_name == "Reg-API"

    models_list = registry.list_models()
    assert len(models_list) >= 2


def test_fastapi_llm_endpoints():
    # Health endpoint
    res_health = client.get("/llm/health")
    assert res_health.status_code == 200
    assert res_health.json()["status"] in ("ok", "degraded")

    # Status endpoint
    res_status = client.get("/llm/status")
    assert res_status.status_code == 200
    assert "active_model_metadata" in res_status.json()

    # Models endpoint
    res_models = client.get("/llm/models")
    assert res_models.status_code == 200
    assert "models" in res_models.json()

    # Generate endpoint
    gen_payload = {
        "prompt": "Explain mutual fund expense ratios.",
        "max_new_tokens": 128,
        "temperature": 0.5,
    }
    res_gen = client.post("/llm/generate", json=gen_payload)
    assert res_gen.status_code == 200
    assert len(res_gen.json()["text"]) > 0
    assert res_gen.json()["completion_tokens"] > 0

    # Switch endpoint
    res_switch = client.post("/llm/switch", json={"provider_key": "mock"})
    assert res_switch.status_code == 200
    assert res_switch.json()["status"] == "success"
