"""Saved database connection profile (source or target).

The DB password is **never** stored in plaintext: it is encrypted with
Fernet at the service layer and persisted in ``encrypted_password``.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Any

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin, enum_column
from app.models.enums import DBType, SSLMode

if TYPE_CHECKING:
    from app.models.user import User


class Connection(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "connections"

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    db_type: Mapped[DBType] = mapped_column(enum_column(DBType), nullable=False)

    # host/port/username are nullable to accommodate SQLite (file path lives
    # in ``database_name``) and engines that authenticate differently.
    host: Mapped[str | None] = mapped_column(String(255), nullable=True)
    port: Mapped[int | None] = mapped_column(Integer, nullable=True)
    database_name: Mapped[str] = mapped_column(String(255), nullable=False)
    username: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Fernet-encrypted secret (opaque ciphertext); never exposed via the API.
    encrypted_password: Mapped[str | None] = mapped_column(Text, nullable=True)

    ssl_mode: Mapped[SSLMode] = mapped_column(
        enum_column(SSLMode), default=SSLMode.DISABLE, nullable=False
    )
    # Driver-specific extras: e.g. MongoDB authSource/replicaSet, JDBC params.
    extra_params: Mapped[dict[str, Any]] = mapped_column(
        JSONB, default=dict, nullable=False
    )

    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    owner: Mapped["User"] = relationship(back_populates="connections")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Connection {self.name} ({self.db_type})>"
