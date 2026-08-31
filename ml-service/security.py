"""
WealthGenie ML Microservice - Security & Authentication Layer
Provides API key extraction, validation, and constant-time authentication dependencies.
"""

import hmac
import logging
import os
from typing import Optional
from fastapi import HTTPException, Security, status
from fastapi.security.api_key import APIKeyHeader

logger = logging.getLogger("wealthgenie.security")

LOCAL_ENVIRONMENTS = {"local", "test", "development"}


def _environment_mode(environ: dict) -> str:
    """Return an explicit mode, defaulting an unset local shell to development.

    Production deployments set ENVIRONMENT=production in docker-compose. Treating
    an omitted value as development keeps the documented local setup usable while
    retaining fail-closed checks whenever production is explicitly selected.
    """
    return environ.get("ENVIRONMENT", "development").strip().lower() or "development"

API_KEY_NAME = "X-API-Key"
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)

VERIFIED_USER_HEADER = "X-Verified-User-Id"
verified_user_header = APIKeyHeader(name=VERIFIED_USER_HEADER, auto_error=False)


def validate_ml_service_config(environ: Optional[dict] = None) -> None:
    """Validate ML service security configuration at startup.

    Raises RuntimeError if required credentials are missing or set to
    insecure placeholder values in non-local environments.
    """
    env_dict = environ if environ is not None else os.environ
    env_mode = _environment_mode(env_dict)
    api_key = env_dict.get("ML_SERVICE_API_KEY", "").strip()

    if env_mode not in LOCAL_ENVIRONMENTS:
        if not api_key:
            raise RuntimeError(
                "FATAL Startup Misconfiguration: ML_SERVICE_API_KEY is required in production environments. "
                "Set ENVIRONMENT=local to permit dev-mode bypass."
            )
        if api_key.startswith("CHANGE_ME"):
            raise RuntimeError(
                "FATAL Startup Misconfiguration: Insecure placeholder ML_SERVICE_API_KEY configured in production environment."
            )


async def verify_api_key(api_key: str = Security(api_key_header)) -> str:
    """Authenticate requests via constant-time API key comparison.

    Uses hmac.compare_digest for timing-attack-resistant string equality
    checks against the ML_SERVICE_API_KEY environment variable.
    """
    expected_key = os.environ.get("ML_SERVICE_API_KEY", "").strip()
    env_mode = _environment_mode(os.environ)

    if not expected_key:
        if env_mode in LOCAL_ENVIRONMENTS:
            return api_key or "dev-mode"
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server Misconfiguration: ML_SERVICE_API_KEY is not set. Set ENVIRONMENT=local to permit dev-mode bypass."
        )
    if expected_key.startswith("CHANGE_ME") and env_mode not in LOCAL_ENVIRONMENTS:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server Misconfiguration: Insecure placeholder ML_SERVICE_API_KEY configured in production."
        )
    if not api_key or not hmac.compare_digest(api_key, expected_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API Key"
        )
    return api_key


async def verify_verified_user_id(
    user_id: Optional[str] = Security(verified_user_header)
) -> str:
    """Extract and validate the trusted X-Verified-User-Id downstream header.

    Rejects requests missing the header with 401 Unauthorized to ensure
    all user-scoped operations are bound to a verified identity propagated
    by the upstream gateway/Express backend.
    """
    if not user_id or not user_id.strip():
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or empty X-Verified-User-Id header"
        )
    return user_id.strip()


def validate_ml_operator_config(environ: Optional[dict] = None) -> None:
    """Validate ML operator security configuration at startup.

    Raises RuntimeError if ML_OPERATOR_KEY is missing or set to
    insecure placeholder values in non-local environments.
    """
    env_dict = environ if environ is not None else os.environ
    env_mode = _environment_mode(env_dict)
    operator_key = env_dict.get("ML_OPERATOR_KEY", "").strip()

    if env_mode not in LOCAL_ENVIRONMENTS:
        if not operator_key:
            raise RuntimeError(
                "FATAL Startup Misconfiguration: ML_OPERATOR_KEY is required in production environments. "
                "Set ENVIRONMENT=local to permit dev-mode bypass."
            )
        if operator_key.startswith("CHANGE_ME"):
            raise RuntimeError(
                "FATAL Startup Misconfiguration: Insecure placeholder ML_OPERATOR_KEY configured in production environment."
            )


OPERATOR_KEY_NAME = "X-Operator-Key"
operator_key_header = APIKeyHeader(name=OPERATOR_KEY_NAME, auto_error=False)


async def verify_operator_key(operator_key: str = Security(operator_key_header)) -> str:
    """Authenticate operator-only administrative requests via constant-time key comparison.

    Uses hmac.compare_digest for timing-attack-resistant string equality checks
    against the ML_OPERATOR_KEY environment variable.

    OPERATIONAL NOTE:
    ML_OPERATOR_KEY is an out-of-band credential intended exclusively for direct
    operational management (deploy scripts, CI/CD promotion pipelines, infrastructure
    runbooks, or authorized human operators via curl/CLI). It is NOT held, known, or
    forwarded by the Express backend or any customer-facing application services.
    """
    expected_key = os.environ.get("ML_OPERATOR_KEY", "").strip()
    env_mode = _environment_mode(os.environ)

    if not expected_key:
        if env_mode in LOCAL_ENVIRONMENTS:
            return operator_key or "dev-mode-operator"
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server Misconfiguration: ML_OPERATOR_KEY is not set. Set ENVIRONMENT=local to permit dev-mode bypass."
        )
    if expected_key.startswith("CHANGE_ME") and env_mode not in LOCAL_ENVIRONMENTS:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server Misconfiguration: Insecure placeholder ML_OPERATOR_KEY configured in production."
        )
    if not operator_key or not hmac.compare_digest(operator_key, expected_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing Operator Key"
        )
    return operator_key


VERIFIED_USER_ROLE_HEADER = "X-Verified-User-Role"
verified_user_role_header = APIKeyHeader(name=VERIFIED_USER_ROLE_HEADER, auto_error=False)


async def verify_admin_role(
    user_role: Optional[str] = Security(verified_user_role_header),
) -> str:
    """Verify that the caller possesses the 'admin' role via X-Verified-User-Role.

    Returns 403 Forbidden if the header is missing or contains any value
    other than 'admin'.  This dependency is additive — it does NOT replace
    verify_api_key, which must still gate the router.
    """
    if not user_role or user_role.strip().lower() != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Requires admin role.",
        )
    return user_role.strip()
