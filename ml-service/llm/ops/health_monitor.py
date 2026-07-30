"""
WealthGenie Open-Weight LLM Platform - Health Monitor
Periodically checks provider readiness, memory usage, and collects operational telemetry.
"""

import logging
import sys
from typing import Dict, Any, Optional
from datetime import datetime, timezone

from llm.ops.circuit_breaker import CircuitBreaker
from llm.ops.rate_limiter import TokenBucketRateLimiter, llm_rate_limiter
from llm.ops.audit_logger import AuditLogger, llm_audit_logger

logger = logging.getLogger("wealthgenie.llm.ops.health")


class LLMHealthMonitor:
    """Aggregates health, circuit breaker, rate limiter, and audit telemetry into a unified dashboard."""

    def __init__(
        self,
        circuit_breaker: Optional[CircuitBreaker] = None,
        rate_limiter: Optional[TokenBucketRateLimiter] = None,
        audit_logger: Optional[AuditLogger] = None,
    ):
        self.circuit_breaker = circuit_breaker or CircuitBreaker()
        self.rate_limiter = rate_limiter or llm_rate_limiter
        self.audit_logger = audit_logger or llm_audit_logger

    def get_system_health(self) -> Dict[str, Any]:
        """Returns unified health dashboard for the LLM platform."""
        try:
            import torch
            gpu_available = torch.cuda.is_available()
            gpu_name = torch.cuda.get_device_name(0) if gpu_available else "N/A"
            gpu_memory_gb = round(torch.cuda.get_device_properties(0).total_mem / 1e9, 2) if gpu_available else 0.0
        except Exception:
            gpu_available = False
            gpu_name = "N/A"
            gpu_memory_gb = 0.0

        return {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "platform": "WealthGenie Open-Weight LLM Platform v3.6.0",
            "python_version": sys.version,
            "gpu": {
                "available": gpu_available,
                "device_name": gpu_name,
                "total_memory_gb": gpu_memory_gb,
            },
            "circuit_breaker": self.circuit_breaker.get_status(),
            "rate_limiter": self.rate_limiter.get_status(),
            "audit_stats": self.audit_logger.get_stats(),
        }

    def is_healthy(self) -> bool:
        """Quick boolean health check."""
        cb_state = self.circuit_breaker.state.value
        return cb_state != "open"
