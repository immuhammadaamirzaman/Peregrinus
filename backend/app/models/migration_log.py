"""Append-only migration log line.

Uses a monotonic BigInteger primary key (not UUID) so the SSE streaming
endpoint can reliably tail new rows with ``WHERE id > :last_seen_id``.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, enum_column
from app.models.enums import LogLevel

if TYPE_CHECKING:
    from app.models.migration import Migration


class MigrationLog(Base):
    __tablename__ = "migration_logs"
    __table_args__ = (
        # Composite index powers the SSE tail query (per-migration, ordered).
        Index("ix_migration_logs_migration_id_id", "migration_id", "id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)

    migration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("migrations.id", ondelete="CASCADE"), nullable=False
    )

    level: Mapped[LogLevel] = mapped_column(
        enum_column(LogLevel), default=LogLevel.INFO, nullable=False
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)
    context: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    migration: Mapped["Migration"] = relationship(back_populates="logs")
