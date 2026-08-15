"""
BestMe — FastAPI Application Entry Point
==========================================
Configures the FastAPI app, middleware, CORS, and router inclusion.
"""

from __future__ import annotations

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


# ── Lifespan ─────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan handler.

    Startup: Log application info, verify connections.
    Shutdown: Clean up resources gracefully.
    """
    print(f"🚀 {settings.app_name} v{settings.app_version} starting...")
    print(f"   Environment: {settings.environment}")
    print(f"   Database: {settings.database_url.split('@')[-1] if '@' in settings.database_url else 'configured'}")
    print(f"   OpenAI Key: {'✅ configured' if settings.openai_api_key else '⚠️  not set (mock mode)'}")

    yield

    print(f"👋 {settings.app_name} shutting down...")


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
    allow_credentials=True,
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
