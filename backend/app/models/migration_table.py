"""Per-table (or per-collection) selection and progress within a migration."""

from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Any

from sqlalchemy import BigInteger, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin, enum_column
from app.models.enums import TableStatus

if TYPE_CHECKING:
    from app.models.migration import Migration


class MigrationTable(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "migration_tables"

    migration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("migrations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    source_table: Mapped[str] = mapped_column(String(255), nullable=False)
    target_table: Mapped[str] = mapped_column(String(255), nullable=False)

    # ``None`` (NULL) means "all columns/fields". A list selects a subset —
    # this is how the user picks specific MongoDB fields or SQL columns.
    selected_columns: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)

    # Optional source→target rename map, e.g. {"_id": "id", "qty": "quantity"}.
    column_mapping: Mapped[dict[str, str] | None] = mapped_column(JSONB, nullable=True)

    # Optional structured source filter: a list of {column, op, value} conditions
    # (AND-combined). Rendered with parameterized placeholders — never raw SQL.
    filters: Mapped[list[dict] | None] = mapped_column(JSONB, nullable=True)

    order_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    status: Mapped[TableStatus] = mapped_column(
        enum_column(TableStatus), default=TableStatus.PENDING, nullable=False
    )
    rows_total: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    rows_processed: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    migration: Mapped["Migration"] = relationship(back_populates="tables")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<MigrationTable {self.source_table}->{self.target_table} {self.status}>"
