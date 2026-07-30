"""
WealthGenie Open-Weight LLM Platform - Circuit Breaker
Protects LLM provider calls with fail-open circuit breaker pattern (closed → open → half-open).
"""

import logging
import time
from enum import Enum
from typing import Optional

logger = logging.getLogger("wealthgenie.llm.ops.circuit_breaker")


class CircuitState(str, Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitBreaker:
    """
    Circuit breaker for LLM provider calls.
    - CLOSED: Normal operation, failures are counted.
    - OPEN: Requests are rejected immediately after failure_threshold is exceeded.
    - HALF_OPEN: After recovery_timeout, allows a single probe request through.
    """

    def __init__(
        self,
        failure_threshold: int = 5,
        recovery_timeout_seconds: float = 30.0,
        name: str = "llm_circuit_breaker",
    ):
        self.name = name
        self.failure_threshold = failure_threshold
        self.recovery_timeout_seconds = recovery_timeout_seconds

        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._last_failure_time: Optional[float] = None
        self._success_count = 0

    @property
    def state(self) -> CircuitState:
        if self._state == CircuitState.OPEN and self._last_failure_time is not None:
            elapsed = time.monotonic() - self._last_failure_time
            if elapsed >= self.recovery_timeout_seconds:
                logger.info(f"[{self.name}] Recovery timeout elapsed. Transitioning OPEN → HALF_OPEN.")
                self._state = CircuitState.HALF_OPEN
        return self._state

    def allow_request(self) -> bool:
        """Returns True if the circuit breaker allows a request through."""
        current = self.state
        if current == CircuitState.CLOSED:
            return True
        if current == CircuitState.HALF_OPEN:
            return True
        # OPEN
        return False

    def record_success(self) -> None:
        """Records a successful call. Resets circuit to CLOSED."""
        if self._state == CircuitState.HALF_OPEN:
            logger.info(f"[{self.name}] Half-open probe succeeded. Transitioning HALF_OPEN → CLOSED.")
        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._success_count += 1

    def record_failure(self) -> None:
        """Records a failed call. May trip the circuit to OPEN."""
        self._failure_count += 1
        self._last_failure_time = time.monotonic()
        if self._failure_count >= self.failure_threshold:
            logger.warning(
                f"[{self.name}] Failure threshold ({self.failure_threshold}) reached. "
                f"Transitioning → OPEN for {self.recovery_timeout_seconds}s."
            )
            self._state = CircuitState.OPEN

    def reset(self) -> None:
        """Manually resets the circuit breaker to CLOSED."""
        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._last_failure_time = None
        logger.info(f"[{self.name}] Manually reset to CLOSED.")

    def get_status(self) -> dict:
        """Returns current circuit breaker status for monitoring."""
        return {
            "name": self.name,
            "state": self.state.value,
            "failure_count": self._failure_count,
            "failure_threshold": self.failure_threshold,
            "success_count": self._success_count,
            "recovery_timeout_seconds": self.recovery_timeout_seconds,
        }
