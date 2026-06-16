"""Migration job model — the top-level unit of work."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import BigInteger, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin, enum_column
from app.models.enums import MigrationStatus

if TYPE_CHECKING:
    from app.models.connection import Connection
    from app.models.migration_checkpoint import MigrationCheckpoint
    from app.models.migration_log import MigrationLog
    from app.models.migration_table import MigrationTable
    from app.models.user import User


class Migration(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "migrations"

    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    source_connection_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("connections.id", ondelete="RESTRICT"), nullable=False
    )
    target_connection_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("connections.id", ondelete="RESTRICT"), nullable=False
    )

    status: Mapped[MigrationStatus] = mapped_column(
        enum_column(MigrationStatus), default=MigrationStatus.DRAFT, nullable=False, index=True
    )

    # Free-form job options (batch size, drop/truncate target, upsert, etc.).
    options: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, nullable=False)

    total_rows: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    processed_rows: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)

    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Celery task id — lets us revoke/cancel a running job.
    celery_task_id: Mapped[str | None] = mapped_column(String(64), nullable=True)

    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # ── Relationships ────────────────────────────────────────────
    owner: Mapped["User"] = relationship(back_populates="migrations")
    source_connection: Mapped["Connection"] = relationship(
        foreign_keys=[source_connection_id]
    )
    target_connection: Mapped["Connection"] = relationship(
        foreign_keys=[target_connection_id]
    )
    tables: Mapped[list["MigrationTable"]] = relationship(
        back_populates="migration",
        cascade="all, delete-orphan",
        order_by="MigrationTable.order_index",
    )
    logs: Mapped[list["MigrationLog"]] = relationship(
        back_populates="migration", cascade="all, delete-orphan"
    )
    checkpoints: Mapped[list["MigrationCheckpoint"]] = relationship(
        back_populates="migration", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Migration {self.name} status={self.status}>"
