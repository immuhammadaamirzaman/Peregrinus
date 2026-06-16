"""Migration job schemas."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

from app.models.enums import LogLevel, MigrationStatus, TableStatus
from app.schemas.common import ORMModel

FilterOp = Literal["eq", "ne", "gt", "gte", "lt", "lte", "like", "in", "nin"]


class FilterCondition(BaseModel):
    """A single structured, injection-safe filter condition.

    Conditions on a table are AND-combined. ``value`` must be a list for the
    ``in`` / ``nin`` operators.
    """

    column: str = Field(min_length=1, max_length=255)
    op: FilterOp = "eq"
    value: Any = None

    @field_validator("column")
    @classmethod
    def _safe_column(cls, v: str) -> str:
        from app.services.filters import SAFE_IDENT

        if not SAFE_IDENT.match(v):
            raise ValueError("column must be a valid identifier (letters, digits, _ . $)")
        return v


class MigrationOptions(BaseModel):
    """Tunable job options (persisted as JSON on the migration)."""

    batch_size: int = Field(default=1000, ge=1, le=100_000)
    max_in_flight: int = Field(default=64, ge=1, le=2_000)
    # "skip" makes restarts idempotent for targets with a unique key
    # (Postgres ON CONFLICT DO NOTHING / MySQL INSERT IGNORE / SQLite OR IGNORE).
    on_conflict: Literal["error", "skip"] = "error"
    # When True, a missing target table is created automatically from the
    # source schema before the copy. When False (default), a missing target
    # table fails the migration with a clear error rather than hanging.
    create_tables: bool = False


class MigrationTableSpec(BaseModel):
    """One table/collection to copy."""

    source_table: str = Field(min_length=1, max_length=255)
    # Defaults to source_table when omitted.
    target_table: str | None = Field(default=None, max_length=255)
    # None = copy all columns/fields; a list selects a subset.
    selected_columns: list[str] | None = None
    # Optional source→target rename, e.g. {"_id": "id"}.
    column_mapping: dict[str, str] | None = None
    # Optional structured source filter (AND-combined, parameterized).
    filters: list[FilterCondition] | None = None


class MigrationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    source_connection_id: uuid.UUID
    target_connection_id: uuid.UUID
    tables: list[MigrationTableSpec] = Field(min_length=1)
    options: MigrationOptions = Field(default_factory=MigrationOptions)


class MigrationUpdate(BaseModel):
    """Partial update. Table edits are only honoured while status == DRAFT."""

    name: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    options: MigrationOptions | None = None
    tables: list[MigrationTableSpec] | None = None


# ── Read models ──────────────────────────────────────────────────
class MigrationTableRead(ORMModel):
    id: uuid.UUID
    source_table: str
    target_table: str
    selected_columns: list[str] | None
    column_mapping: dict[str, str] | None
    filters: list[dict] | None
    order_index: int
    status: TableStatus
    rows_total: int
    rows_processed: int
    error_message: str | None


class MigrationRead(ORMModel):
    id: uuid.UUID
    name: str
    description: str | None
    source_connection_id: uuid.UUID
    target_connection_id: uuid.UUID
    status: MigrationStatus
    options: dict[str, Any]
    total_rows: int
    processed_rows: int
    error_message: str | None
    started_at: datetime | None
    finished_at: datetime | None
    created_at: datetime
    updated_at: datetime


class MigrationDetail(MigrationRead):
    tables: list[MigrationTableRead]


class MigrationLogRead(ORMModel):
    id: int
    level: LogLevel
    message: str
    context: dict[str, Any] | None
    created_at: datetime
