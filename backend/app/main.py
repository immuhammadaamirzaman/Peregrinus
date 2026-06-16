"""FastAPI application entrypoint.

Run (from the ``backend`` directory):

    uvicorn app.main:app --reload
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.core.exceptions import register_exception_handlers
from app.database import AsyncSessionLocal
from app.routers import auth, connections, migrations, stream, users
from app.services import auth_service

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-5s [%(name)s] %(message)s",
)
logger = logging.getLogger("datamovers")


def _assert_secure_config() -> None:
    """Fail closed on insecure secrets — never sign tokens with a known key."""
    secret = settings.jwt_secret_key
    if not secret or secret == "CHANGE_ME" or len(secret) < 32:
        raise RuntimeError(
            "JWT_SECRET_KEY is unset, the placeholder, or too short (<32 chars). "
            "Generate one with `python scripts/generate_keys.py` and set it in .env."
        )


@asynccontextmanager
async def lifespan(_: FastAPI):
    _assert_secure_config()  # hard-fail before serving any request
    # Seed the first admin if the database is reachable + empty.
    try:
        async with AsyncSessionLocal() as session:
            await auth_service.bootstrap_first_admin(session)
            await session.commit()
    except Exception as exc:  # don't block startup if the DB isn't ready
        logger.warning("Admin bootstrap skipped: %s", exc)
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="Move data between databases (Postgres ⇄ MySQL ⇄ MongoDB ⇄ SQLite).",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)

# Routers (all under /api/v1).
for module in (auth, users, connections, migrations, stream):
    app.include_router(module.router, prefix=settings.api_v1_prefix)


@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    return {"status": "ok", "app": settings.app_name}
