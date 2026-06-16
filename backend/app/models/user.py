"""User account model."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin, enum_column
from app.models.enums import Role, UserStatus

if TYPE_CHECKING:
    from app.models.connection import Connection
    from app.models.migration import Migration


class User(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    role: Mapped[Role] = mapped_column(
        enum_column(Role), default=Role.USER, nullable=False
    )
    status: Mapped[UserStatus] = mapped_column(
        enum_column(UserStatus), default=UserStatus.PENDING, nullable=False
    )

    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # ── Relationships ────────────────────────────────────────────
    connections: Mapped[list["Connection"]] = relationship(
        back_populates="owner", cascade="all, delete-orphan"
    )
    migrations: Mapped[list["Migration"]] = relationship(
        back_populates="owner", cascade="all, delete-orphan"
    )

    # ── Convenience predicates ───────────────────────────────────
    @property
    def is_admin(self) -> bool:
        return self.role == Role.ADMIN

    @property
    def is_guest(self) -> bool:
        return self.role == Role.GUEST

    @property
    def can_login(self) -> bool:
        return self.status == UserStatus.APPROVED

    def __repr__(self) -> str:  # pragma: no cover
        return f"<User {self.email} role={self.role} status={self.status}>"
