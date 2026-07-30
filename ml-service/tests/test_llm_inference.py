"""
WealthGenie Open-Weight LLM Platform - Production Inference Test Suite (Phase 3.5)
Tests conversation management, financial tool calling, batch inference, and RAG+LLM endpoints.
"""

import pytest
from fastapi.testclient import TestClient

from llm.inference.conversation import ConversationHistory
from llm.inference.tools import ToolCallingEngine
from llm.schema import ChatMessage


def test_conversation_history_management():
    conv = ConversationHistory(session_id="session-001")
    assert conv.session_id == "session-001"
    assert len(conv.messages) == 0

    conv.add_message("user", "What is Section 87A?")
    conv.add_message("assistant", "Section 87A provides a tax rebate.")
    assert len(conv.messages) == 2

    payload = conv.get_messages_payload()
    assert payload[0]["role"] == "user"
    assert payload[1]["content"] == "Section 87A provides a tax rebate."

    conv.clear()
    assert len(conv.messages) == 0


def test_conversation_sliding_window_truncation():
    conv = ConversationHistory(session_id="session-002", max_history_turns=3)
    for i in range(10):
        conv.add_message("user", f"Question {i}")
        conv.add_message("assistant", f"Answer {i}")
    # Should retain only the last max_history_turns * 2 = 6 messages
    assert len(conv.messages) <= 6


def test_tool_calling_engine_sip():
    engine = ToolCallingEngine()
    result = engine.execute_tool("calculate_sip", {
        "monthly_investment": 10000, "rate_pct": 12.0, "years": 10,
    })
    assert result.success
    assert result.result["estimated_future_value"] > 0
    assert result.result["total_invested"] == 1200000.0


def test_tool_calling_engine_cagr():
    engine = ToolCallingEngine()
    result = engine.execute_tool("calculate_cagr", {
        "initial_value": 100000, "final_value": 200000, "years": 5,
    })
    assert result.success
    assert 14.0 <= result.result["cagr_percent"] <= 15.0


def test_tool_calling_engine_tax_rebate():
    engine = ToolCallingEngine()
    result = engine.execute_tool("calculate_tax_rebate", {
        "taxable_income": 600000, "regime": "new",
    })
    assert result.success
    assert result.result["net_tax_liability"] == 0.0
    assert result.result["section_87a_rebate"] > 0


def test_tool_calling_engine_unknown_tool():
    engine = ToolCallingEngine()
    result = engine.execute_tool("nonexistent_tool", {})
    assert not result.success
    assert "error" in result.result


def test_tool_calling_engine_list_tools():
    engine = ToolCallingEngine()
    tools = engine.list_tools()
    assert len(tools) == 3
    names = [t["name"] for t in tools]
    assert "calculate_sip" in names
    assert "calculate_cagr" in names
    assert "calculate_tax_rebate" in names


def test_llm_router_batch_generate_and_tool_endpoints():
    from main import app
    client = TestClient(app)

    # Batch generate
    batch_res = client.post("/llm/batch-generate", json=[
        {"prompt": "What is ELSS?"},
        {"prompt": "Explain PPF."},
    ])
    assert batch_res.status_code == 200
    data = batch_res.json()
    assert data["batch_count"] == 2
    assert len(data["responses"]) == 2

    # Tool query
    tool_res = client.post("/llm/tool-query", json={
        "tool_name": "calculate_sip",
        "arguments": {"monthly_investment": 5000, "rate_pct": 10.0, "years": 5},
    })
    assert tool_res.status_code == 200
    assert tool_res.json()["success"]

    # List tools
    tools_res = client.get("/llm/tools")
    assert tools_res.status_code == 200
    assert len(tools_res.json()["tools"]) == 3
