"""Connection schemas + schema-discovery response shapes.

The plaintext password is only ever an *input*; it is encrypted at the
service layer and never returned. Responses expose ``has_password`` instead.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field, computed_field, model_validator

from app.models.enums import DBType, SSLMode
from app.schemas.common import ORMModel


class _ConnFields(BaseModel):
    """Connectivity fields shared by create / test payloads."""

    db_type: DBType
    host: str | None = Field(default=None, max_length=255)
    port: int | None = Field(default=None, ge=1, le=65535)
    database_name: str = Field(min_length=1, max_length=255)
    username: str | None = Field(default=None, max_length=255)
    ssl_mode: SSLMode = SSLMode.DISABLE
    extra_params: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _validate_requirements(self) -> "_ConnFields":
        if self.db_type == DBType.MSSQL:
            raise ValueError("MSSQL support is planned for a later phase.")
        if self.db_type in (DBType.POSTGRES, DBType.MYSQL) and not self.host:
            raise ValueError(f"'host' is required for {self.db_type} connections.")
        if (
            self.db_type == DBType.MONGODB
            and not self.host
            and not self.extra_params.get("uri")
        ):
            raise ValueError(
                "MongoDB requires either 'host' or 'extra_params.uri'."
            )
        return self


class ConnectionCreate(_ConnFields):
    name: str = Field(min_length=1, max_length=120)
    # Optional: SQLite needs no password; trusted local DBs may omit it.
    password: str | None = Field(default=None, max_length=512)


class ConnectionUpdate(BaseModel):
    """Partial update. Omit ``password`` to keep the stored one unchanged."""

    name: str | None = Field(default=None, min_length=1, max_length=120)
    host: str | None = Field(default=None, max_length=255)
    port: int | None = Field(default=None, ge=1, le=65535)
    database_name: str | None = Field(default=None, min_length=1, max_length=255)
    username: str | None = Field(default=None, max_length=255)
    password: str | None = Field(default=None, max_length=512)
    ssl_mode: SSLMode | None = None
    extra_params: dict[str, Any] | None = None


class ConnectionTestRequest(_ConnFields):
    """Transient connectivity check (not persisted)."""

    password: str | None = Field(default=None, max_length=512)


class ConnectionRead(ORMModel):
    id: uuid.UUID
    name: str
    db_type: DBType
    host: str | None
    port: int | None
    database_name: str
    username: str | None
    ssl_mode: SSLMode
    extra_params: dict[str, Any]
    owner_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    # Backing column, excluded from output; surfaced via has_password below.
    encrypted_password: str | None = Field(default=None, exclude=True)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def has_password(self) -> bool:
        return self.encrypted_password is not None


class ConnectionTestResult(BaseModel):
    ok: bool
    message: str
    server_version: str | None = None
    latency_ms: float | None = None


# ── Schema-discovery shapes ──────────────────────────────────────
class ColumnInfo(BaseModel):
    name: str
    type: str
    nullable: bool | None = None
    primary_key: bool = False


class TableColumns(BaseModel):
    table: str
    columns: list[ColumnInfo]


class TableList(BaseModel):
    db_type: DBType
    database: str
    tables: list[str]
