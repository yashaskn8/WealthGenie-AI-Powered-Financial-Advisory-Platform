import pytest
import asyncio
from unittest.mock import MagicMock, patch
import pandas as pd
from model.registry.drift_scheduler import DriftScheduler


@pytest.mark.asyncio
async def test_drift_scheduler_tick_skips_on_insufficient_samples():
    scheduler = DriftScheduler()
    scheduler._interval_seconds = 1
    scheduler._min_samples = 100
    mock_store = MagicMock()

    with patch("model.registry.drift_monitor.inference_buffer.size", return_value=5):
        scheduler.start(mock_store)
        await asyncio.sleep(1.2)
        assert scheduler.tick_count >= 1
        await scheduler.stop()
        assert not scheduler.is_running


@pytest.mark.asyncio
async def test_drift_scheduler_triggers_check_on_sufficient_samples():
    scheduler = DriftScheduler()
    scheduler._interval_seconds = 1
    scheduler._min_samples = 10
    mock_store = MagicMock()

    with patch("model.registry.drift_monitor.inference_buffer.size", return_value=15), \
         patch("model.registry.drift_monitor.check_drift_and_trigger_retrain", return_value={
             "status": "COMPLETED",
             "overall_verdict": "FAIL",
             "max_psi": 2.5,
             "drift_detected": True,
             "retrain_triggered": True,
             "candidate_version": {"version_id": "test-candidate-123"}
         }) as mock_drift_check:
        scheduler.start(mock_store)
        await asyncio.sleep(1.2)
        assert scheduler.tick_count >= 1
        await scheduler.stop()
        mock_drift_check.assert_called()
        call_kwargs = mock_drift_check.call_args[1]
        assert call_kwargs.get("registered_by") == "drift_scheduler"
