"""
BestMe — Test Fixtures
========================
Shared fixtures for the API test suite.

Runs against a file-backed SQLite database per test (a fresh temp file, not
`:memory:`, because each aiosqlite connection would otherwise get its own
empty database). The models use dialect-aware column types, so the same
mappings that produce JSONB/UUID on PostgreSQL produce JSON/CHAR here.
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import AsyncIterator

# Must be set before app.config is imported anywhere.
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-not-used-in-production")
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("DEBUG", "false")
os.environ.pop("ANTHROPIC_API_KEY", None)

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.core.security import create_access_token  # noqa: E402
from app.database import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models.user import ActivityLevel, FitnessGoal, Gender, User  # noqa: E402
from app.services.vision import VisionService  # noqa: E402

# ── Keep the suite off the paid API ──────────────────────────────
#
# Clearing the environment variable is NOT enough: pydantic-settings also
# reads backend/.env, so a key configured there still reaches the tests and
# every run bills real requests to Anthropic. Blank the resolved setting on
# the cached Settings instance instead — that is what VisionService reads.
_settings = get_settings()
_settings.anthropic_api_key = None

assert not VisionService.is_configured(), (
    "Los tests no deben llamar a la API de pago. "
    "VisionService sigue configurado pese a anular la clave."
)


@pytest.fixture(autouse=True)
def _fail_on_real_api_call(monkeypatch):
    """
    Second line of defence.

    If a future change re-enables the client, this turns a silent (billed)
    network call into an obvious test failure.
    """
    def _forbidden(*_args, **_kwargs):
        raise AssertionError(
            "Un test intentó llamar a la API de Anthropic. "
            "Los tests deben usar el modo de datos de ejemplo."
        )

    monkeypatch.setattr(VisionService, "_analyze", staticmethod(_forbidden))


@pytest_asyncio.fixture
async def db_engine() -> AsyncIterator:
    """A fresh SQLite database for each test."""
    handle, path = tempfile.mkstemp(suffix=".db", prefix="bestme_test_")
    os.close(handle)

    engine = create_async_engine(f"sqlite+aiosqlite:///{Path(path).as_posix()}")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    try:
        yield engine
    finally:
        await engine.dispose()
        Path(path).unlink(missing_ok=True)


@pytest_asyncio.fixture
async def db_session(db_engine) -> AsyncIterator[AsyncSession]:
    """A session bound to the per-test database."""
    factory = async_sessionmaker(db_engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session


@pytest_asyncio.fixture
async def async_client(db_engine, db_session) -> AsyncIterator[AsyncClient]:
    """
    HTTP client wired to the app, with `get_db` pointed at the test database.

    The dependency yields the *same* session the test holds, so a row the test
    creates is visible to the request handler and vice versa.
    """

    async def override_get_db() -> AsyncIterator[AsyncSession]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def test_user(db_session: AsyncSession) -> User:
    """A user with a complete anthropometric profile and no body scan yet."""
    from datetime import date

    user = User(
        email="test@bestme.app",
        hashed_password="not-a-real-hash",
        full_name="Usuario Prueba",
        date_of_birth=date(1995, 6, 15),
        gender=Gender.MALE,
        height_cm=178.0,
        weight_kg=82.0,
        body_fat_percentage=None,
        activity_level=ActivityLevel.MODERATE,
        goal=FitnessGoal.LOSE_WEIGHT,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.fixture
def test_user_token(test_user: User) -> str:
    """A valid access token for `test_user`."""
    return create_access_token(data={"sub": str(test_user.id)})


@pytest.fixture
def auth_headers(test_user_token: str) -> dict[str, str]:
    """Authorization header ready to pass to the client."""
    return {"Authorization": f"Bearer {test_user_token}"}
