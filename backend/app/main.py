import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .database import get_db, reset_db
from .routers import agents, chat, chat_stream, conversations, health, websocket
from .services.conversation_service import reset_conversation_service
from .services.orchestrator import get_orchestrator_service

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan handler for startup and shutdown events."""
    settings = get_settings()
    logging.basicConfig(
        level=settings.log_level,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )
    logger.info(
        "Starting %s (debug=%s, log_level=%s)",
        settings.app_name,
        settings.debug,
        settings.log_level,
    )
    logger.info("Auth mode: %s", settings.auth_mode.upper())
    if settings.auth_mode == "dev":
        logger.warning(
            "DEV AUTH MODE ACTIVE -- all API requests bypass token validation. "
            "Do NOT use this in production."
        )
    logger.info("CORS origins: %s", settings.cors_origins)
    logger.info("Orchestrator URL: %s", settings.orchestrator_url)
    logger.info("Database URL: %s", settings.database_url)

    # Initialize the SQLite database (creates tables if needed)
    get_db(settings.database_url)
    logger.info("Database initialized")

    yield

    # Clean up the orchestrator HTTP client on shutdown
    orch_service = get_orchestrator_service(settings)
    await orch_service.close()
    # Clean up database and service singletons
    reset_conversation_service()
    reset_db()
    logger.info("Shutting down %s", settings.app_name)


app = FastAPI(
    title="ITOM Chat Backend",
    description=(
        "API backend for the ITOM Chat UI providing conversation management, "
        "real-time WebSocket communication, agent routing, and streaming chat "
        "with ServiceNow ITOM agents."
    ),
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# CORS middleware — configured from settings
settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(health.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(chat_stream.router, prefix="/api")
app.include_router(agents.router, prefix="/api")
app.include_router(conversations.router, prefix="/api")
app.include_router(websocket.router)
