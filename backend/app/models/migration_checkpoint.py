"""Per-table completion checkpoint.

Phase 1 resume is **table-level**: on restart, tables already marked DONE are
skipped, while incomplete tables are re-copied from the start (full-dump has no
row-level cursor yet). To keep re-copies from duplicating rows, set the
migration's ``on_conflict: "skip"`` option so SQL targets with a unique key use
ON CONFLICT DO NOTHING / INSERT IGNORE.

``last_offset`` / ``rows_processed`` record how many rows a completed table
copied (for reporting); row-level keyset resume is a future enhancement.
"""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.migration import Migration


class MigrationCheckpoint(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "migration_checkpoints"
    __table_args__ = (
        UniqueConstraint("migration_id", "table_name", name="uq_checkpoint_migration_table"),
    )

    migration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("migrations.id", ondelete="CASCADE"), nullable=False
    )
    table_name: Mapped[str] = mapped_column(String(255), nullable=False)

    last_offset: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    rows_processed: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)

    migration: Mapped["Migration"] = relationship(back_populates="checkpoints")
