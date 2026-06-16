"""Authentication: registration, login, token refresh, admin bootstrap."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from fastapi.concurrency import run_in_threadpool
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import AuthenticationError, ConflictError
from app.core.security import (
    TokenError,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.enums import Role, UserStatus
from app.models.user import User
from app.schemas.auth import RegisterRequest, Token

logger = logging.getLogger(__name__)


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email.lower()))
    return result.scalar_one_or_none()


def _build_tokens(user: User) -> Token:
    return Token(
        access_token=create_access_token(user.id, user.role.value),
        refresh_token=create_refresh_token(user.id, user.role.value),
    )


async def register(db: AsyncSession, data: RegisterRequest) -> User:
    """Create a PENDING account. An admin must approve it before login works."""
    if await get_user_by_email(db, data.email):
        raise ConflictError("A user with this email already exists.")

    hashed = await run_in_threadpool(hash_password, data.password)
    user = User(
        email=data.email.lower(),
        hashed_password=hashed,
        full_name=data.full_name,
        role=Role.USER,
        status=UserStatus.PENDING,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    logger.info("New registration pending approval: %s", user.email)
    return user


async def authenticate(db: AsyncSession, email: str, password: str) -> Token:
    """Verify credentials + approval status, then issue tokens."""
    user = await get_user_by_email(db, email)
    # Verify off the event loop (bcrypt is CPU-bound, ~100-300ms).
    password_ok = await run_in_threadpool(
        verify_password, password, user.hashed_password if user else ""
    )
    if user is None or not password_ok:
        raise AuthenticationError("Incorrect email or password.")

    if user.status == UserStatus.PENDING:
        raise AuthenticationError("Your account is awaiting admin approval.")
    if user.status != UserStatus.APPROVED:
        raise AuthenticationError("Your account access has been revoked.")

    user.last_login_at = datetime.now(timezone.utc)
    return _build_tokens(user)


async def refresh_tokens(db: AsyncSession, refresh_token: str) -> Token:
    """Exchange a valid refresh token for a fresh token pair."""
    try:
        payload = decode_token(refresh_token, expected_type="refresh")
        user_id = uuid.UUID(payload["sub"])
    except (TokenError, KeyError, ValueError) as exc:
        raise AuthenticationError("Invalid refresh token.") from exc

    user = await db.get(User, user_id)
    if user is None or user.status != UserStatus.APPROVED:
        raise AuthenticationError("Account is not active.")
    return _build_tokens(user)


async def bootstrap_first_admin(db: AsyncSession) -> None:
    """Seed the very first admin account if the users table is empty.

    Idempotent: does nothing once any user exists.
    """
    user_count = await db.scalar(select(func.count()).select_from(User))
    if user_count:
        return

    if settings.first_admin_password in ("", "change-me-admin"):
        logger.error(
            "Refusing to seed the first admin with the default password. "
            "Set a strong FIRST_ADMIN_PASSWORD in .env and restart."
        )
        return

    admin = User(
        email=settings.first_admin_email.lower(),
        hashed_password=hash_password(settings.first_admin_password),
        full_name="Administrator",
        role=Role.ADMIN,
        status=UserStatus.APPROVED,
    )
    db.add(admin)
    await db.flush()
    logger.warning(
        "Bootstrapped first admin account '%s'. Change its password immediately.",
        admin.email,
    )
