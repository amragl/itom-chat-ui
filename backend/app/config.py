from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables.

    All settings can be overridden via environment variables prefixed with CHAT_.
    For example, CHAT_DEBUG=true sets debug=True.

    CORS origins can be set as a JSON list or a comma-separated string:
        CHAT_CORS_ORIGINS=http://localhost:3000,http://localhost:3001
        CHAT_CORS_ORIGINS=["http://localhost:3000"]
    """

    model_config = SettingsConfigDict(env_prefix="CHAT_", env_file=".env")

    app_name: str = "ITOM Chat Backend"
    debug: bool = False
    log_level: str = "INFO"
    cors_origins: list[str] = ["http://localhost:3000"]
    orchestrator_url: str = "http://localhost:8000"
    database_url: str = "sqlite:///./chat.db"

    # ServiceNow authentication settings
    servicenow_instance: str = ""
    auth_token_cache_ttl: int = 300  # seconds (5 minutes)

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: object) -> list[str]:
        """Accept CORS origins as a JSON list or a comma-separated string.

        Examples of valid input:
            '["http://localhost:3000"]'  -> ["http://localhost:3000"]
            'http://localhost:3000,http://localhost:3001'
                -> ["http://localhost:3000", "http://localhost:3001"]
            'http://localhost:3000'  -> ["http://localhost:3000"]
            ["http://localhost:3000"]  -> ["http://localhost:3000"]  (pass-through)
        """
        if isinstance(value, list):
            return value
        if isinstance(value, str):
            stripped = value.strip()
            # If it looks like a JSON array, let pydantic handle it
            if stripped.startswith("["):
                import json

                return json.loads(stripped)  # type: ignore[no-any-return]
            # Otherwise, treat as comma-separated
            return [origin.strip() for origin in stripped.split(",") if origin.strip()]
        return value  # type: ignore[return-value]

    @field_validator("log_level")
    @classmethod
    def validate_log_level(cls, value: str) -> str:
        """Ensure log_level is a recognized Python logging level."""
        allowed = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
        upper = value.upper()
        if upper not in allowed:
            raise ValueError(
                f"Invalid log_level '{value}'. Must be one of: {', '.join(sorted(allowed))}"
            )
        return upper


# Singleton pattern for settings
_settings: Settings | None = None


def get_settings() -> Settings:
    """Return the application settings singleton.

    Creates the Settings instance on first call and caches it for subsequent calls.
    """
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings


def reset_settings() -> None:
    """Reset the settings singleton, forcing re-creation on next access.

    Useful for testing with different environment configurations.
    """
    global _settings
    _settings = None
