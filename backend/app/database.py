"""
BestMe — Database Engine & Session
====================================
Async SQLAlchemy engine and session factory for PostgreSQL.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings

settings = get_settings()

# ── Async Engine ─────────────────────────────────────────────────
# Connection pooling options are PostgreSQL-specific: SQLite uses a
# StaticPool that rejects them outright. Keeping them conditional lets the
# test suite run against an in-memory SQLite database.
_engine_options: dict = {
    "echo": settings.debug,
    "future": True,
}
if not settings.database_url.startswith("sqlite"):
    _engine_options.update(
        pool_size=20,
        max_overflow=10,
        pool_pre_ping=True,
    )

engine = create_async_engine(settings.database_url, **_engine_options)

# ── Session Factory ──────────────────────────────────────────────
async_session = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# ── Declarative Base ─────────────────────────────────────────────
class Base(DeclarativeBase):
    """Base class for all SQLAlchemy ORM models."""
    pass


# ── Dependency ───────────────────────────────────────────────────
async def get_db() -> AsyncSession:
    """FastAPI dependency that yields an async database session."""
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
