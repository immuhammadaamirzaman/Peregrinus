"""FastAPI application entrypoint.

Run (from the ``backend`` directory):

    uvicorn app.main:app --reload
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from slowapi.errors import RateLimitExceeded

from app.config import settings
from app.core.exceptions import register_exception_handlers
from app.core.ratelimit import limiter, rate_limit_exceeded_handler
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
    # Don't expose the interactive API explorer / schema in production.
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
    openapi_url=None if settings.is_production else "/openapi.json",
)

# Rate limiter (used by the auth router via decorators).
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)


# ── Middleware ───────────────────────────────────────────────────
# NOTE: the last-added middleware is the OUTERMOST. CORS is added last so it
# wraps everything (incl. error responses from the guards below).
@app.middleware("http")
async def _security_headers(request: Request, call_next):
    response: Response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")
    # API responses are JSON; lock the document context down entirely. The SPA
    # is served separately and needs its own CSP at the web-server layer.
    response.headers.setdefault(
        "Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
    )
    if settings.is_production:
        response.headers.setdefault(
            "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
        )
    return response


@app.middleware("http")
async def _limit_body_size(request: Request, call_next):
    content_length = request.headers.get("content-length")
    if content_length and content_length.isdigit() and int(content_length) > settings.max_request_bytes:
        return JSONResponse(
            status_code=413,
            content={"error": {"code": "payload_too_large", "detail": "Request body too large."}},
        )
    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

register_exception_handlers(app)

# Routers (all under /api/v1).
for module in (auth, users, connections, migrations, stream):
    app.include_router(module.router, prefix=settings.api_v1_prefix)


@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    return {"status": "ok", "app": settings.app_name}
