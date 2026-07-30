"""
WealthGenie RAG Subsystem - Logging Test Suite
Tests structured JSON log formatting, file logging, and contextual event emission.
"""

import json
import logging
from rag.logging import StructuredJSONFormatter, setup_rag_logger, log_rag_event


def test_structured_json_formatter():
    formatter = StructuredJSONFormatter()
    record = logging.LogRecord(
        name="test_logger",
        level=logging.INFO,
        pathname="test.py",
        lineno=10,
        msg="Test log message",
        args=(),
        exc_info=None,
    )
    record.tenant_id = "tenant_xyz"
    record.trace_id = "trace_12345"
    record.duration_ms = 45.2

    formatted_json = formatter.format(record)
    parsed = json.loads(formatted_json)

    assert parsed["level"] == "INFO"
    assert parsed["logger"] == "test_logger"
    assert parsed["message"] == "Test log message"
    assert parsed["tenant_id"] == "tenant_xyz"
    assert parsed["trace_id"] == "trace_12345"
    assert parsed["duration_ms"] == 45.2


def test_setup_rag_logger_file_emission(tmp_path):
    log_file = tmp_path / "test_rag.log"
    logger = setup_rag_logger(name="test_rag_subsystem", log_file=log_file)

    log_rag_event(
        logger=logger,
        level=logging.INFO,
        message="Document indexed successfully",
        tenant_id="org_alpha",
        trace_id="tr_8888",
        component="IngestionPipeline",
        duration_ms=12.5,
    )

    assert log_file.exists()
    content = log_file.read_text(encoding="utf-8")
    assert "Document indexed successfully" in content

    lines = content.strip().split("\n")
    last_line = json.loads(lines[-1])
    assert last_line["tenant_id"] == "org_alpha"
    assert last_line["trace_id"] == "tr_8888"
    assert last_line["component"] == "IngestionPipeline"
