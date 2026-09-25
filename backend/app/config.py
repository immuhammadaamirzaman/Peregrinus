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
    # Default OFF: ``debug`` enables verbose SQLAlchemy SQL echo (which would
    # log bound params — bcrypt hashes, emails, etc.). Opt in explicitly in dev.
    debug: bool = False
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

    # ── Outbound connection / file-access guardrails (SSRF) ──────
    # User-supplied DB hosts that resolve to private/loopback ranges are
    # refused unless this is True. Link-local (cloud metadata 169.254.x),
    # multicast, reserved and unspecified addresses are ALWAYS refused.
    # Defaults to allowing private hosts only outside production, so local-DB
    # development keeps working while production fails closed.
    db_allow_private_hosts: bool | None = None
    # SQLite database files are confined to this directory (relative paths
    # resolved against it; absolute paths / traversal rejected).
    sqlite_base_dir: str = "sqlite_data"
    # Directory that user-referenced TLS cert files (sslrootcert / ssl_ca)
    # must live under.
    ssl_cert_dir: str = "certs"

    # ── First admin bootstrap ────────────────────────────────────
    # No usable default password: bootstrap is fail-closed and refuses to seed
    # an admin unless a strong FIRST_ADMIN_PASSWORD is explicitly provided
    # (see app.services.auth_service.bootstrap_first_admin).
    first_admin_email: str = "admin@datamovers.dev"
    first_admin_password: str = ""

    # ── CORS (stored as comma-separated string in env) ───────────
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    # ── Request limits / DoS ─────────────────────────────────────
    # Reject request bodies larger than this (bytes). Migration specs are small.
    max_request_bytes: int = 1_000_000
    # Cap on concurrent open SSE log streams (per process).
    max_sse_connections: int = 100

    # ── Rate limiting ────────────────────────────────────────────
    # Storage for the auth rate limiter. "memory://" is per-process (fine for a
    # single worker / dev); point at Redis (e.g. redis://localhost:6379/2) for a
    # shared limit across multiple API workers.
    rate_limit_storage_uri: str = "memory://"
    rate_limit_auth: str = "5/minute"

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

    @property
    def effective_allow_private_hosts(self) -> bool:
        """Whether user DB hosts may resolve to private/loopback ranges.
        Explicit setting wins; otherwise allowed only outside production."""
        if self.db_allow_private_hosts is not None:
            return self.db_allow_private_hosts
        return not self.is_production


@lru_cache
def get_settings() -> Settings:
    """Cached singleton accessor. Import this everywhere instead of Settings()."""
    return Settings()


settings = get_settings()
