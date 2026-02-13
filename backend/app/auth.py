"""FastAPI authentication dependency for ServiceNow OAuth token validation.

Validates Bearer tokens by introspecting them against the ServiceNow instance.
Caches validated tokens with a configurable TTL to avoid repeated API calls.
"""

import logging
import time

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import Settings, get_settings
from .models.auth import CurrentUser

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Token cache
# ---------------------------------------------------------------------------

_token_cache: dict[str, tuple[CurrentUser, float]] = {}
"""In-memory cache mapping access tokens to (user, expiry_timestamp)."""

security = HTTPBearer(auto_error=False)


def _cache_get(token: str, ttl: int) -> CurrentUser | None:
    """Return a cached user if the token is cached and not expired."""
    entry = _token_cache.get(token)
    if entry is None:
        return None
    user, cached_at = entry
    if time.monotonic() - cached_at > ttl:
        del _token_cache[token]
        return None
    return user


def _cache_set(token: str, user: CurrentUser) -> None:
    """Store a validated user in the cache."""
    _token_cache[token] = (user, time.monotonic())


def clear_token_cache() -> None:
    """Clear the entire token cache. Useful for testing."""
    _token_cache.clear()


# ---------------------------------------------------------------------------
# ServiceNow token validation
# ---------------------------------------------------------------------------

async def _validate_token_with_servicenow(
    token: str,
    instance: str,
) -> CurrentUser | None:
    """Validate a ServiceNow OAuth access token by using it to fetch the user profile.

    Rather than a formal introspection endpoint, ServiceNow tokens are validated
    by calling the /api/now/ui/user endpoint (which returns the current user's
    username) and then fetching the full profile from sys_user.

    Returns None if the token is invalid or the user cannot be resolved.
    """
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        # Step 1: Identify the current user
        try:
            me_response = await client.get(
                f"{instance}/api/now/ui/user",
                headers=headers,
            )
        except httpx.RequestError as exc:
            logger.error("ServiceNow unreachable during token validation: %s", exc)
            return None

        if me_response.status_code != 200:
            logger.debug(
                "Token validation failed: /api/now/ui/user returned %d",
                me_response.status_code,
            )
            return None

        me_data = me_response.json()
        user_name = me_data.get("result", {}).get("user_name")
        if not user_name:
            logger.debug("Token validation failed: no user_name in /api/now/ui/user response")
            return None

        # Step 2: Fetch full profile from sys_user
        try:
            user_response = await client.get(
                f"{instance}/api/now/table/sys_user",
                headers=headers,
                params={
                    "sysparm_query": f"user_name={user_name}",
                    "sysparm_fields": "sys_id,user_name,name,email,title",
                    "sysparm_limit": "1",
                },
            )
        except httpx.RequestError as exc:
            logger.error("Failed to fetch sys_user profile: %s", exc)
            return None

        if user_response.status_code != 200:
            logger.debug("sys_user query failed: %d", user_response.status_code)
            return None

        user_data = user_response.json()
        records = user_data.get("result", [])
        if not records:
            logger.debug("No sys_user record found for %s", user_name)
            return None

        record = records[0]
        sys_id = record.get("sys_id", "")

        # Step 3: Fetch roles from sys_user_has_role
        roles: list[str] = []
        try:
            roles_response = await client.get(
                f"{instance}/api/now/table/sys_user_has_role",
                headers=headers,
                params={
                    "sysparm_query": f"user={sys_id}^state=active",
                    "sysparm_fields": "role",
                    "sysparm_display_value": "true",
                    "sysparm_limit": "100",
                },
            )
            if roles_response.status_code == 200:
                roles_data = roles_response.json()
                for entry in roles_data.get("result", []):
                    role_val = entry.get("role", {})
                    if isinstance(role_val, dict):
                        display = role_val.get("display_value", "")
                    else:
                        display = str(role_val)
                    if display:
                        roles.append(display)
        except httpx.RequestError:
            logger.warning("Failed to fetch roles for %s, proceeding without roles", user_name)

        return CurrentUser(
            sys_id=sys_id,
            user_name=record.get("user_name", user_name),
            name=record.get("name", ""),
            email=record.get("email", ""),
            title=record.get("title", ""),
            roles=roles,
        )


# ---------------------------------------------------------------------------
# FastAPI dependency
# ---------------------------------------------------------------------------

async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    settings: Settings = Depends(get_settings),
) -> CurrentUser:
    """FastAPI dependency that validates the ServiceNow access token.

    Extracts the Bearer token from the Authorization header, validates it
    against the ServiceNow instance (with caching), and returns the user.

    Raises 401 if the token is missing, invalid, or the ServiceNow instance
    is not configured.
    """
    if credentials is None or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Provide a Bearer token in the Authorization header.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials

    if not settings.servicenow_instance:
        logger.error("CHAT_SERVICENOW_INSTANCE is not configured")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication service is not configured.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check cache first
    cached_user = _cache_get(token, settings.auth_token_cache_ttl)
    if cached_user is not None:
        return cached_user

    # Validate against ServiceNow
    user = await _validate_token_with_servicenow(token, settings.servicenow_instance)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired ServiceNow access token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Cache the validated user
    _cache_set(token, user)
    return user
