"""Password hashing and JWT issuance / verification.

* Passwords are hashed with **bcrypt**. Inputs are first SHA-256 pre-hashed
  and base64-encoded so passwords longer than bcrypt's 72-byte limit are
  fully covered (no silent truncation).
* Tokens are signed JWTs (HS256 by default) carrying ``sub`` (user id),
  ``role``, ``type`` (access|refresh), ``iat``, ``exp`` and ``jti``.
"""

from __future__ import annotations

import base64
import hashlib
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

import bcrypt
import jwt

from app.config import settings

TokenType = Literal["access", "refresh"]


# ── Password hashing ─────────────────────────────────────────────
def _prepare(password: str) -> bytes:
    """SHA-256 → base64 so arbitrarily long passwords fit bcrypt's 72 bytes."""
    digest = hashlib.sha256(password.encode("utf-8")).digest()
    return base64.b64encode(digest)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(_prepare(password), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(_prepare(password), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


# ── JWT ──────────────────────────────────────────────────────────
def _create_token(
    subject: str | uuid.UUID,
    role: str,
    token_type: TokenType,
    expires_delta: timedelta,
) -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": str(subject),
        "role": role,
        "type": token_type,
        "iat": now,
        "exp": now + expires_delta,
        "jti": uuid.uuid4().hex,
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_access_token(subject: str | uuid.UUID, role: str) -> str:
    return _create_token(
        subject, role, "access",
        timedelta(minutes=settings.access_token_expire_minutes),
    )


def create_refresh_token(subject: str | uuid.UUID, role: str) -> str:
    return _create_token(
        subject, role, "refresh",
        timedelta(days=settings.refresh_token_expire_days),
    )


class TokenError(Exception):
    """Raised when a token is missing, malformed, expired or of the wrong type."""


def decode_token(token: str, expected_type: TokenType | None = None) -> dict[str, Any]:
    """Decode and validate a JWT. Raises :class:`TokenError` on any problem."""
    try:
        payload = jwt.decode(
            token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )
    except jwt.ExpiredSignatureError as exc:
        raise TokenError("Token has expired") from exc
    except jwt.PyJWTError as exc:
        raise TokenError("Invalid token") from exc

    if expected_type is not None and payload.get("type") != expected_type:
        raise TokenError(f"Expected a {expected_type} token")
    return payload
