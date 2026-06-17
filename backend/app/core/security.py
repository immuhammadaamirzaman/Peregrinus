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


# ── Password policy (enforced for privileged bootstrap accounts) ──
MIN_PASSWORD_LENGTH = 12

# Well-known / trivially guessable values that must never be accepted for the
# bootstrap admin (compared case-insensitively after stripping whitespace).
_WEAK_PASSWORDS = frozenset(
    {
        "admin",
        "admin1234",
        "administrator",
        "password",
        "passw0rd",
        "change-me",
        "change-me-admin",
        "changeme",
        "letmein",
        "secret",
        "datamovers",
        "12345678",
        "123456789",
        "1234567890",
    }
)


def is_acceptable_password(password: str | None) -> bool:
    """True if ``password`` meets the minimum bootstrap policy: at least
    :data:`MIN_PASSWORD_LENGTH` characters and not a well-known weak value."""
    if not password or len(password) < MIN_PASSWORD_LENGTH:
        return False
    return password.strip().lower() not in _WEAK_PASSWORDS


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
    jti: str | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    payload: dict[str, Any] = {
        "sub": str(subject),
        "role": role,
        "type": token_type,
        "iat": now,
        "exp": now + expires_delta,
        "jti": jti or uuid.uuid4().hex,
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_access_token(subject: str | uuid.UUID, role: str) -> str:
    return _create_token(
        subject, role, "access",
        timedelta(minutes=settings.access_token_expire_minutes),
    )


def refresh_token_lifetime() -> timedelta:
    return timedelta(days=settings.refresh_token_expire_days)


def create_refresh_token(subject: str | uuid.UUID, role: str, jti: str) -> str:
    """Mint a refresh token bound to a persisted session ``jti`` (so it can be
    rotated / revoked server-side)."""
    return _create_token(
        subject, role, "refresh", refresh_token_lifetime(), jti=jti
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
