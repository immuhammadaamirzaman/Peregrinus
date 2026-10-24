"""Connection schemas + schema-discovery response shapes.

The plaintext password is only ever an *input*; it is encrypted at the
service layer and never returned. Responses expose ``has_password`` instead.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import Any
from urllib.parse import urlsplit

from pydantic import (
    BaseModel,
    Field,
    computed_field,
    field_validator,
    model_validator,
)

from app.models.enums import DBType, SSLMode
from app.schemas.common import ORMModel


# Allowlist of permitted extra_params keys per engine. Anything else is
# rejected so the free-form dict cannot smuggle arbitrary driver options.
_ALLOWED_EXTRA_PARAMS: dict[DBType, set[str]] = {
    DBType.POSTGRES: {"schema", "sslrootcert"},
    DBType.MYSQL: {"ssl_ca"},
    DBType.MONGODB: {"uri", "authSource", "replicaSet"},
    DBType.SQLITE: set(),
    # Snowflake has no host:port: the account identifier goes in ``host`` and
    # the rest of its addressing (which compute warehouse runs the query,
    # which schema inside the database, which role's grants apply) lives here.
    DBType.SNOWFLAKE: {"warehouse", "schema", "role"},
}

# Snowflake extras that must be a non-empty string when present, and that are
# interpolated into SQL as identifiers — so they get the same strict alphabet
# as a table name rather than being quoted.
_SNOWFLAKE_IDENT_PARAMS = ("warehouse", "schema", "role")
_SNOWFLAKE_IDENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_$]*$")


def _uri_has_credentials(uri: str) -> bool:
    """True if a connection URI embeds a username or password in its authority."""
    try:
        parts = urlsplit(uri)
    except ValueError:
        # Malformed URIs are surfaced downstream (netguard); don't mask them.
        return False
    return bool(parts.username or parts.password)


def check_no_uri_credentials(extra_params: dict[str, Any]) -> None:
    """Reject a credential embedded in ``extra_params.uri``.

    Unlike the dedicated ``password`` field (encrypted at rest and never
    returned), ``extra_params`` is stored as plaintext JSONB and echoed back by
    ``ConnectionRead`` — which admins *and* read-only guests can fetch for every
    connection. A secret placed here would therefore be readable by other users,
    so the two must stay strictly separate.
    """
    uri = extra_params.get("uri")
    if isinstance(uri, str) and _uri_has_credentials(uri):
        raise ValueError(
            "Do not embed a username or password in 'extra_params.uri'. "
            "Put the username in the 'username' field and the password in "
            "the 'password' field so the secret is encrypted at rest."
        )


def check_extra_param_keys(db_type: DBType, extra_params: dict[str, Any]) -> None:
    """Reject ``extra_params`` keys outside the engine's allowlist."""
    allowed = _ALLOWED_EXTRA_PARAMS.get(db_type, set())
    unknown = set(extra_params) - allowed
    if unknown:
        raise ValueError(
            f"Unsupported extra_params for {db_type}: "
            f"{', '.join(sorted(unknown))}. Allowed: {', '.join(sorted(allowed)) or 'none'}."
        )


def check_snowflake_identifiers(extra_params: dict[str, Any]) -> None:
    """Constrain the Snowflake extras that are interpolated as SQL identifiers."""
    for key in _SNOWFLAKE_IDENT_PARAMS:
        value = extra_params.get(key)
        if value is None:
            continue
        if not isinstance(value, str) or not _SNOWFLAKE_IDENT_RE.match(value):
            raise ValueError(
                f"Snowflake '{key}' must be a plain unquoted identifier "
                "(letters, digits and underscores, not starting with a digit)."
            )


def validate_extra_params(db_type: DBType, extra_params: dict[str, Any]) -> None:
    """Full ``extra_params`` policy for one engine.

    Shared by the create/test schemas (which know their ``db_type`` up front)
    and by the partial-update service path (which reads it off the stored row),
    so a PATCH cannot sidestep rules the create path enforces. Raises
    :class:`ValueError`; callers map that onto their own error type.
    """
    check_extra_param_keys(db_type, extra_params)
    if db_type == DBType.SNOWFLAKE:
        check_snowflake_identifiers(extra_params)
    check_no_uri_credentials(extra_params)


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
        check_extra_param_keys(self.db_type, self.extra_params)
        # After the allowlist, so a typo'd key is reported as a typo rather
        # than as a missing required field.
        if self.db_type == DBType.SNOWFLAKE:
            self._validate_snowflake()
        check_no_uri_credentials(self.extra_params)
        return self

    def _validate_snowflake(self) -> None:
        """Require the fields a Snowflake session genuinely cannot start without.

        Snowflake needs more than host/database/user: a query is executed by a
        named virtual *warehouse*, and tables are addressed as
        ``database.schema.table``. Omitting the warehouse still authenticates,
        so the failure surfaces much later as "No active warehouse selected in
        the current session" midway through a migration — catch it at the edge
        instead.
        """
        if not self.host:
            raise ValueError(
                "Snowflake requires an account identifier in 'host' "
                "(for example 'myorg-acct123')."
            )
        if not self.username:
            raise ValueError("'username' is required for Snowflake connections.")
        if not self.extra_params.get("warehouse"):
            raise ValueError(
                "Snowflake requires 'extra_params.warehouse' — the virtual "
                "warehouse that executes queries (for example 'COMPUTE_WH')."
            )
        # Snowflake is HTTPS-only on 443 and the driver derives the endpoint
        # from the account identifier; a port here is silently ignored, which
        # is worse than rejecting it.
        if self.port not in (None, 443):
            raise ValueError(
                "Snowflake connects over HTTPS on port 443; leave 'port' empty."
            )
        check_snowflake_identifiers(self.extra_params)


class ConnectionCreate(_ConnFields):
    name: str = Field(min_length=1, max_length=120)
    # Optional: SQLite needs no password; trusted local DBs may omit it.
    password: str | None = Field(default=None, max_length=512)


class ConnectionUpdate(BaseModel):
    """Partial update. Omit ``password`` to keep the stored one unchanged.

    ``db_type`` is deliberately absent (an engine change would invalidate every
    other field), so the engine-specific ``extra_params`` rules are applied by
    the service layer against the *stored* type. The engine-independent
    credential rule is enforced here, at the edge.
    """

    name: str | None = Field(default=None, min_length=1, max_length=120)
    host: str | None = Field(default=None, max_length=255)
    port: int | None = Field(default=None, ge=1, le=65535)
    database_name: str | None = Field(default=None, min_length=1, max_length=255)
    username: str | None = Field(default=None, max_length=255)
    password: str | None = Field(default=None, max_length=512)
    ssl_mode: SSLMode | None = None
    extra_params: dict[str, Any] | None = None

    @field_validator("extra_params")
    @classmethod
    def _no_uri_credentials(
        cls, value: dict[str, Any] | None
    ) -> dict[str, Any] | None:
        if value is not None:
            check_no_uri_credentials(value)
        return value


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
