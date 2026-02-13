import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .routers import agents, chat, health, websocket
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
    logger.info("CORS origins: %s", settings.cors_origins)
    logger.info("Orchestrator URL: %s", settings.orchestrator_url)
    logger.info("Database URL: %s", settings.database_url)
    yield
    # Clean up the orchestrator HTTP client on shutdown
    orch_service = get_orchestrator_service(settings)
    await orch_service.close()
    logger.info("Shutting down %s", settings.app_name)


app = FastAPI(
    title="ITOM Chat Backend",
    description="API backend for the ITOM Chat UI",
    version="0.1.0",
    lifespan=lifespan,
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
app.include_router(agents.router, prefix="/api")
app.include_router(websocket.router)
