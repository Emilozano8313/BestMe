"""
BestMe — Application Configuration
====================================
Centralised settings loaded from environment variables via Pydantic BaseSettings.
"""

from __future__ import annotations

import json
from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application-wide settings sourced from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # ── Application ──────────────────────────────────────────────
    app_name: str = "BestMe"
    app_version: str = "0.1.0"
    debug: bool = True
    environment: str = "development"

    # ── Database ─────────────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://bestme_user:bestme_secret_2024@db:5432/bestme_db"

    # ── JWT ──────────────────────────────────────────────────────
    jwt_secret_key: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # ── CORS ─────────────────────────────────────────────────────
    cors_origins: str = '["*"]'

    @property
    def cors_origins_list(self) -> List[str]:
        """Parse the JSON-encoded CORS origins string into a Python list."""
        try:
            return json.loads(self.cors_origins)
        except (json.JSONDecodeError, TypeError):
            return ["*"]

    # ── External APIs (Phase 4+) ─────────────────────────────────
    openai_api_key: str | None = None
    google_cloud_vision_key: str | None = None
    nutritionix_app_id: str | None = None
    nutritionix_app_key: str | None = None


@lru_cache
def get_settings() -> Settings:
    """Return a cached singleton of the application settings."""
    return Settings()
