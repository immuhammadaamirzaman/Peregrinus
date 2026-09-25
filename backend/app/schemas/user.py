"""User schemas."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, EmailStr

from app.models.enums import Role, UserStatus
from app.schemas.common import ORMModel


class UserRead(ORMModel):
    id: uuid.UUID
    email: str
    full_name: str | None
    role: Role
    status: UserStatus
    last_login_at: datetime | None
    created_at: datetime
    preferences: dict[str, Any] = {}


class UserPreferencesUpdate(BaseModel):
    """Self-service endpoint: user updates their own UI preferences."""
    preferences: dict[str, Any]


class UserRoleUpdate(BaseModel):
    role: Role


class UserStatusUpdate(BaseModel):
    status: UserStatus
