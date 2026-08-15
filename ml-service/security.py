"""
WealthGenie ML Microservice - Security & Authentication Layer
Provides API key extraction, validation, and constant-time authentication dependencies.
"""

import hmac
import logging
import os
from fastapi import HTTPException, Security, status
from fastapi.security.api_key import APIKeyHeader

logger = logging.getLogger("wealthgenie.security")

API_KEY_NAME = "X-API-Key"
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)


async def verify_api_key(api_key: str = Security(api_key_header)) -> str:
    """Authenticate requests via constant-time API key comparison.

    Uses hmac.compare_digest for timing-attack-resistant string equality
    checks against the ML_SERVICE_API_KEY environment variable.
    """
    expected_key = os.environ.get("ML_SERVICE_API_KEY", "")
    env_mode = os.environ.get("ENVIRONMENT", "").lower()

    if not expected_key:
        if env_mode == "local":
            return api_key or "dev-mode"
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server Misconfiguration: ML_SERVICE_API_KEY is not set. Set ENVIRONMENT=local to permit dev-mode bypass."
        )
    if not api_key or not hmac.compare_digest(api_key, expected_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API Key"
        )
    return api_key