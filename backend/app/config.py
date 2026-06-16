"""Application configuration.

All settings are loaded from environment variables / the `.env` file via
pydantic-settings. Database connection URLs are *computed* from discrete
components so operators never have to hand-write driver strings.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── App ──────────────────────────────────────────────────────
    app_name: str = "DataMovers"
    environment: str = "development"
    debug: bool = True
    api_v1_prefix: str = "/api/v1"

    # ── Metadata database (our own Postgres) ─────────────────────
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_user: str = "datamovers"
    postgres_password: str = "change-me"
    postgres_db: str = "datamovers"

    # ── JWT ──────────────────────────────────────────────────────
    jwt_secret_key: str = "CHANGE_ME"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    # ── Credential encryption (Fernet) ───────────────────────────
    encryption_key: str = "CHANGE_ME"

    # ── Celery / Redis ───────────────────────────────────────────
    celery_broker_url: str = "redis://localhost:6379/0"
    celery_result_backend: str = "redis://localhost:6379/1"

    # ── Redpanda Connect ─────────────────────────────────────────
    redpanda_connect_bin: str = "bin/rpk-connect.exe"

    # ── First admin bootstrap ────────────────────────────────────
    first_admin_email: str = "admin@datamovers.dev"
    first_admin_password: str = "admin1234"

    # ── CORS (stored as comma-separated string in env) ───────────
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    # ── Computed URLs / helpers ──────────────────────────────────
    @computed_field  # type: ignore[prop-decorator]
    @property
    def async_database_url(self) -> str:
        """Async SQLAlchemy URL (asyncpg) used by the FastAPI layer."""
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def sync_database_url(self) -> str:
        """Sync SQLAlchemy URL (psycopg2) used by Celery workers + Alembic."""
        return (
            f"postgresql+psycopg2://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"


@lru_cache
def get_settings() -> Settings:
    """Cached singleton accessor. Import this everywhere instead of Settings()."""
    return Settings()


settings = get_settings()
