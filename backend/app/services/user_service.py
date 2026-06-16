"""Admin-facing user management: list, approve/reject, role changes, delete."""

from __future__ import annotations

import uuid
from collections.abc import Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import InvalidStateError, NotFoundError
from app.models.enums import Role, UserStatus
from app.models.user import User


async def list_users(db: AsyncSession) -> Sequence[User]:
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    return result.scalars().all()


async def get_user_or_404(db: AsyncSession, user_id: uuid.UUID) -> User:
    user = await db.get(User, user_id)
    if user is None:
        raise NotFoundError("User not found.")
    return user


async def set_role(
    db: AsyncSession, user_id: uuid.UUID, role: Role, acting_user: User
) -> User:
    if user_id == acting_user.id:
        raise InvalidStateError("You cannot change your own role.")
    user = await get_user_or_404(db, user_id)
    user.role = role
    return user


async def set_status(
    db: AsyncSession, user_id: uuid.UUID, status: UserStatus, acting_user: User
) -> User:
    """Approve, reject, disable or re-enable an account."""
    if user_id == acting_user.id:
        raise InvalidStateError("You cannot change your own account status.")
    user = await get_user_or_404(db, user_id)
    user.status = status
    return user


async def delete_user(
    db: AsyncSession, user_id: uuid.UUID, acting_user: User
) -> None:
    if user_id == acting_user.id:
        raise InvalidStateError("You cannot delete your own account.")
    user = await get_user_or_404(db, user_id)
    await db.delete(user)
