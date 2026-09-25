"""Authentication: registration, login, token refresh, admin bootstrap."""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi.concurrency import run_in_threadpool
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import AuthenticationError, ConflictError
from app.core.security import (
    MIN_PASSWORD_LENGTH,
    TokenError,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    is_acceptable_password,
    refresh_token_lifetime,
    verify_password,
)
from app.models.enums import Role, UserStatus
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.schemas.auth import RegisterRequest

logger = logging.getLogger(__name__)


@dataclass
class IssuedTokens:
    """A freshly-issued access token plus the refresh token the router will
    place in an httpOnly cookie (never returned to JavaScript)."""

    access_token: str
    refresh_token: str


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email.lower()))
    return result.scalar_one_or_none()


async def _revoke_family(db: AsyncSession, family_id: uuid.UUID) -> None:
    """Revoke every still-active refresh token in a rotation family."""
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.family_id == family_id, RefreshToken.revoked.is_(False))
        .values(revoked=True)
    )


async def _issue_session(
    db: AsyncSession, user: User, *, family_id: uuid.UUID | None = None
) -> IssuedTokens:
    """Persist a new refresh-token session and mint the token pair bound to it."""
    jti = uuid.uuid4().hex
    family = family_id or uuid.uuid4()
    expires_at = datetime.now(timezone.utc) + refresh_token_lifetime()
    db.add(
        RefreshToken(jti=jti, user_id=user.id, family_id=family, expires_at=expires_at)
    )
    await db.flush()
    return IssuedTokens(
        access_token=create_access_token(user.id, user.role.value),
        refresh_token=create_refresh_token(user.id, user.role.value, jti),
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


async def authenticate(db: AsyncSession, email: str, password: str) -> IssuedTokens:
    """Verify credentials + approval status, then open a new session."""
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
    return await _issue_session(db, user)


async def refresh_tokens(db: AsyncSession, refresh_token: str) -> IssuedTokens:
    """Rotate a refresh token: validate the persisted session, revoke it, and
    issue a fresh pair in the same family. Reuse of an already-revoked token is
    treated as theft and revokes the whole family."""
    try:
        payload = decode_token(refresh_token, expected_type="refresh")
        user_id = uuid.UUID(payload["sub"])
        jti = str(payload["jti"])
    except (TokenError, KeyError, ValueError) as exc:
        raise AuthenticationError("Invalid refresh token.") from exc

    row = await db.scalar(select(RefreshToken).where(RefreshToken.jti == jti))
    if row is None:
        # Validly-signed but unknown session id — cannot be trusted.
        raise AuthenticationError("Invalid refresh token.")
    if row.revoked:
        await _revoke_family(db, row.family_id)
        # Commit the revocation even though we return an error: get_db rolls
        # back on the raised exception, which would otherwise undo it.
        await db.commit()
        logger.warning("Refresh-token reuse detected for user %s; revoked family.", user_id)
        raise AuthenticationError("Refresh token is no longer valid; please sign in again.")
    if row.expires_at <= datetime.now(timezone.utc):
        row.revoked = True
        await db.commit()
        raise AuthenticationError("Refresh token has expired.")

    user = await db.get(User, user_id)
    if user is None or user.status != UserStatus.APPROVED:
        raise AuthenticationError("Account is not active.")

    row.revoked = True  # rotate: invalidate the presented token
    return await _issue_session(db, user, family_id=row.family_id)


async def logout(db: AsyncSession, refresh_token: str | None) -> None:
    """Revoke the session (family) behind a refresh token. Best-effort: a
    missing/invalid token is a no-op (the client clears its own state)."""
    if not refresh_token:
        return
    try:
        payload = decode_token(refresh_token, expected_type="refresh")
        jti = str(payload["jti"])
    except (TokenError, KeyError):
        return
    row = await db.scalar(select(RefreshToken).where(RefreshToken.jti == jti))
    if row is not None:
        await _revoke_family(db, row.family_id)


async def bootstrap_first_admin(db: AsyncSession) -> None:
    """Seed the very first admin account if the users table is empty.

    Idempotent: does nothing once any user exists.
    """
    user_count = await db.scalar(select(func.count()).select_from(User))
    if user_count:
        return

    if not is_acceptable_password(settings.first_admin_password):
        logger.error(
            "Refusing to seed the first admin: FIRST_ADMIN_PASSWORD is unset, "
            "shorter than %d characters, or a well-known weak value. Set a "
            "strong FIRST_ADMIN_PASSWORD in .env and restart.",
            MIN_PASSWORD_LENGTH,
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
