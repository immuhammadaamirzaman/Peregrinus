"""FastAPI dependencies: authentication and role-based access control."""

from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable

from fastapi import Depends
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.exceptions import AuthenticationError, PermissionDeniedError
from app.core.security import TokenError, decode_token
from app.database import get_db
from app.models.enums import Role, UserStatus
from app.models.user import User

# tokenUrl powers the "Authorize" button in Swagger UI.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.api_v1_prefix}/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Resolve the authenticated user from a Bearer *access* token."""
    try:
        payload = decode_token(token, expected_type="access")
        user_id = uuid.UUID(payload["sub"])
    except (TokenError, KeyError, ValueError) as exc:
        raise AuthenticationError() from exc

    user = await db.get(User, user_id)
    if user is None:
        raise AuthenticationError("User no longer exists.")
    if user.status != UserStatus.APPROVED:
        raise AuthenticationError("Account is not approved for access.")
    return user


def require_roles(*allowed: Role) -> Callable[[User], Awaitable[User]]:
    """Dependency factory enforcing that the current user holds one of
    ``allowed`` roles. Use for endpoint-level authorization."""

    async def _guard(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed:
            raise PermissionDeniedError()
        return current_user

    return _guard


# ── Common pre-baked guards ──────────────────────────────────────
# Any approved user (including guests) — read access.
require_authenticated = get_current_user

# Mutating actions: admins and regular users, but NOT guests.
require_writer = require_roles(Role.ADMIN, Role.USER)

# Admin-only: user management, role changes, approvals.
require_admin = require_roles(Role.ADMIN)
