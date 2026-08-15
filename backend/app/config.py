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
    jwt_secret_key: str = "insecure-development-key-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7

    # ── CORS ─────────────────────────────────────────────────────
    # Accepts a JSON array or a comma-separated list.
    cors_origins: str = '["*"]'

    @property
    def is_production(self) -> bool:
        return self.environment.lower() in {"production", "prod"}

    @property
    def cors_origins_list(self) -> List[str]:
        """Parse the CORS origins setting into a list."""
        raw = (self.cors_origins or "").strip()
        if not raw:
            return []
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return [str(origin).strip() for origin in parsed if str(origin).strip()]
        except (json.JSONDecodeError, TypeError):
            pass
        return [origin.strip() for origin in raw.split(",") if origin.strip()]

    @property
    def allow_credentials(self) -> bool:
        """
        Credentialed CORS is incompatible with a wildcard origin — browsers
        reject the combination outright. Only enable it once origins are
        listed explicitly.
        """
        return "*" not in self.cors_origins_list

    def validate_for_production(self) -> None:
        """
        Fail fast on unsafe production configuration.

        Called at startup: a deployment running with the development JWT
        secret would let anyone mint valid tokens.
        """
        if not self.is_production:
            return

        problems: List[str] = []
        if self.jwt_secret_key == Settings.model_fields["jwt_secret_key"].default:
            problems.append(
                "JWT_SECRET_KEY sigue siendo el valor por defecto. "
                "Genera uno con: python -c \"import secrets; print(secrets.token_urlsafe(64))\""
            )
        if "*" in self.cors_origins_list:
            problems.append(
                "CORS_ORIGINS no puede ser '*' en producción. "
                'Usa la lista explícita, p. ej. ["https://tu-app.com"]'
            )
        if self.debug:
            problems.append(
                "DEBUG=true en producción registra todas las consultas SQL "
                "(incluidos los hashes de contraseñas) en los logs."
            )

        if problems:
            raise RuntimeError(
                "Configuración de producción insegura:\n  - " + "\n  - ".join(problems)
            )

    # ── External APIs ────────────────────────────────────────────
    # Without this the vision endpoints return clearly-labelled sample data
    # instead of a real analysis. Get one at console.anthropic.com.
    anthropic_api_key: str | None = None


@lru_cache
def get_settings() -> Settings:
    """Return a cached singleton of the application settings."""
    return Settings()
