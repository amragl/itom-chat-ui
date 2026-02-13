from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables.

    All settings can be overridden via environment variables prefixed with CHAT_.
    For example, CHAT_DEBUG=true sets debug=True.
    """

    model_config = SettingsConfigDict(env_prefix="CHAT_", env_file=".env")

    app_name: str = "ITOM Chat Backend"
    debug: bool = False
    log_level: str = "INFO"
    cors_origins: list[str] = ["http://localhost:3000"]
    orchestrator_url: str = "http://localhost:8000"
    database_url: str = "sqlite:///./chat.db"


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
