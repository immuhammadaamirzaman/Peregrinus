"""Rate limiting for sensitive endpoints (authentication).

A single shared Limiter keyed by client IP, applied via decorators on the auth
routes (see :mod:`app.routers.auth`). Storage is configurable via
``RATE_LIMIT_STORAGE_URI`` — in-memory by default (per-process; fine for a
single worker), or point it at Redis for a limit shared across API workers.
"""

from __future__ import annotations

from fastapi import Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.config import settings

limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=settings.rate_limit_storage_uri,
)


async def rate_limit_exceeded_handler(
    request: Request, exc: RateLimitExceeded
) -> JSONResponse:
    """Return the standard DataMovers error envelope (not slowapi's default)
    so the SPA surfaces a clean message on HTTP 429."""
    return JSONResponse(
        status_code=429,
        content={
            "error": {
                "code": "rate_limited",
                "detail": "Too many requests. Please slow down and try again shortly.",
            }
        },
        headers={"Retry-After": "60"},
    )
