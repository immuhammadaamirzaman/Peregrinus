"""Declarative base, common mixins, and the enum-column helper."""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import StrEnum
from typing import Any

from sqlalchemy import DateTime, Enum as SAEnum, MetaData, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# Deterministic constraint names → stable, conflict-free Alembic migrations.
NAMING_CONVENTION = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    """Shared declarative base for all ORM models."""

    metadata = MetaData(naming_convention=NAMING_CONVENTION)


def enum_column(enum_cls: type[StrEnum], **kwargs: Any) -> SAEnum:
    """Build a portable, value-backed enum column.

    Uses ``native_enum=False`` (VARCHAR + CHECK constraint) so adding new
    enum members never requires a Postgres ``ALTER TYPE`` migration, and
    persists the member *value* (e.g. ``"admin"``) rather than its name.
    The ``name`` feeds the ``ck`` naming convention above.
    """
    return SAEnum(
        enum_cls,
        native_enum=False,
        length=32,
        name=enum_cls.__name__.lower(),
        values_callable=lambda e: [member.value for member in e],
        **kwargs,
    )


class UUIDMixin:
    """Non-enumerable UUID primary key (avoids leaking row counts / IDs)."""

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )


class TimestampMixin:
    """``created_at`` / ``updated_at`` maintained by the database."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
