"""Authentication models for ServiceNow OAuth token validation."""

from pydantic import BaseModel


class CurrentUser(BaseModel):
    """Represents the authenticated user extracted from a ServiceNow access token.

    Populated by validating the token against the ServiceNow instance and
    fetching the user profile from the sys_user table.
    """

    sys_id: str
    user_name: str
    name: str
    email: str
    title: str
    roles: list[str] = []
