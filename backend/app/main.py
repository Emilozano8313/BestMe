"""
BestMe — FastAPI Application Entry Point
==========================================
Configures the FastAPI app, middleware, CORS, and router inclusion.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.api.health import router as health_router
from app.api.auth import router as auth_router
from app.api.metrics import router as metrics_router
from app.api.meals import router as meals_router
from app.api.workouts import router as workouts_router
from app.api.scans import router as scans_router

settings = get_settings()

logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
)
logger = logging.getLogger("bestme")


# ── Lifespan ─────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan handler.

    Startup: validate configuration and log what the app is running with.
    Shutdown: clean up resources gracefully.

    Note: messages are plain ASCII on purpose. Emoji crash the Windows
    console (cp1252) with UnicodeEncodeError, which took the whole server
    down at startup outside Docker.
    """
    # Refuses to boot on unsafe production settings (default JWT secret,
    # wildcard CORS, SQL echo) rather than serving them silently.
    settings.validate_for_production()

    database = (
        settings.database_url.split("@")[-1]
        if "@" in settings.database_url
        else settings.database_url.split("///")[-1] or "configured"
    )

    logger.info("%s v%s starting", settings.app_name, settings.app_version)
    logger.info("  Environment: %s", settings.environment)
    logger.info("  Database:    %s", database)
    logger.info(
        "  Claude API:  %s",
        "configured"
        if settings.anthropic_api_key
        else "NOT SET - image analysis returns clearly-labelled sample data",
    )

    yield

    logger.info("%s shutting down", settings.app_name)


# ── App Factory ──────────────────────────────────────────────────
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "API backend para BestMe — Aplicación de salud metabólica y fitness "
        "con integración de visión computacional en tiempo real."
    ),
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)


# ── CORS Middleware ──────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    # A wildcard origin and credentials are mutually exclusive per the CORS
    # spec; browsers reject the pair. See Settings.allow_credentials.
    allow_credentials=settings.allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Router Inclusion ─────────────────────────────────────────────
# NOTE: Routers define their own full prefixes internally (e.g. /meals, /workouts).
# The /api prefix is added here.
app.include_router(health_router, prefix="/api")
app.include_router(auth_router, prefix="/api")
app.include_router(metrics_router, prefix="/api")
app.include_router(meals_router)       # already includes /api/meals internally
app.include_router(workouts_router)    # already includes /api/workouts internally
app.include_router(scans_router)       # already includes /api/scans internally


# ── Root Redirect ────────────────────────────────────────────────
@app.get("/", include_in_schema=False)
async def root():
    """Redirect root to API documentation."""
    return {
        "message": f"Welcome to {settings.app_name} API",
        "docs": "/docs",
        "health": "/api/health",
    }
