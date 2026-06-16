"""Database engines and session factories.

Two stacks coexist:

* **Async** (`asyncpg`)  — used by the FastAPI request/response layer.
* **Sync**  (`psycopg2`) — used by Celery workers and Alembic, which run
  outside the asyncio event loop.

Both share the same declarative `Base` (defined in ``app.models.base``).
"""

from __future__ import annotations

from collections.abc import AsyncGenerator, Generator
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings

# ── Async (FastAPI) ──────────────────────────────────────────────
async_engine: AsyncEngine = create_async_engine(
    settings.async_database_url,
    echo=settings.debug,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

AsyncSessionLocal = async_sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)

# ── Sync (Celery / Alembic / schema discovery) ──────────────────
sync_engine = create_engine(
    settings.sync_database_url,
    echo=settings.debug,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)

SyncSessionLocal = sessionmaker(
    bind=sync_engine,
    class_=Session,
    expire_on_commit=False,
    autoflush=False,
)


# ── FastAPI dependency ───────────────────────────────────────────
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async session; commit on success, rollback on error."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ── Sync context helper (Celery tasks) ──────────────────────────
@contextmanager
def session_scope() -> Generator[Session, None, None]:
    """Transactional sync session for Celery tasks.

    Usage::

        with session_scope() as db:
            db.add(obj)
            # commit happens automatically on clean exit
    """
    session = SyncSessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
