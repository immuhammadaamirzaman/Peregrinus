"""Generate ``CREATE TABLE`` DDL for a migration target from the source schema.

Used by the worker when ``options.create_tables`` is enabled: source columns
discovered via :mod:`app.services.schema_discovery` are mapped through a small
canonical type system to the target engine's column types, so a missing target
table can be created automatically before the copy.

Design notes / limitations (Phase 1):

* The mapping is **conservative** — when in doubt it picks a type that can
  *hold* the source value (e.g. unknown/edge types fall back to a text column)
  rather than a perfectly faithful one.
* Only the columns being copied are created. Defaults, indexes, foreign keys,
  check constraints and sequences are **not** reproduced.
* The single/composite PRIMARY KEY is preserved when every PK column is part of
  the copied set.
* MongoDB targets need no DDL (collections are created implicitly on first
  insert); ``build_create_table_sql`` rejects them.

Identifiers are validated against a strict allowlist and quoted per dialect, so
table/column names can never inject SQL.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import StrEnum

from app.models.enums import DBType
from app.schemas.connection import ColumnInfo

# Column / table identifier guard for names we interpolate into DDL.
_IDENT_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_$]*$")


class Canonical(StrEnum):
    """Engine-agnostic logical column types."""

    TEXT = "text"          # unbounded string
    VARCHAR = "varchar"    # short / indexable string (PK-safe)
    INTEGER = "integer"
    BIGINT = "bigint"
    SMALLINT = "smallint"
    BOOLEAN = "boolean"
    REAL = "real"          # floating point
    NUMERIC = "numeric"    # exact decimal
    UUID = "uuid"
    JSON = "json"
    TIMESTAMP = "timestamp"      # no time zone
    TIMESTAMPTZ = "timestamptz"  # with time zone
    DATE = "date"
    TIME = "time"
    BINARY = "binary"


# Safe default when a native type is unrecognised: text holds anything.
_FALLBACK = Canonical.TEXT


def _norm(native: str) -> str:
    """Lower-case and strip a native type to its bare name (no ``(255)`` etc.)."""
    s = (native or "").strip().lower()
    s = s.split("(")[0].strip()  # drop length/precision: varchar(255), decimal(10,2)
    s = s.replace(" unsigned", "").replace(" zerofill", "").strip()
    return s


# ── Source native type → canonical ───────────────────────────────
_POSTGRES: dict[str, Canonical] = {
    "integer": Canonical.INTEGER, "int": Canonical.INTEGER, "int4": Canonical.INTEGER,
    "serial": Canonical.INTEGER,
    "bigint": Canonical.BIGINT, "int8": Canonical.BIGINT, "bigserial": Canonical.BIGINT,
    "smallint": Canonical.SMALLINT, "int2": Canonical.SMALLINT, "smallserial": Canonical.SMALLINT,
    "numeric": Canonical.NUMERIC, "decimal": Canonical.NUMERIC, "money": Canonical.NUMERIC,
    "real": Canonical.REAL, "double precision": Canonical.REAL,
    "float4": Canonical.REAL, "float8": Canonical.REAL,
    "boolean": Canonical.BOOLEAN, "bool": Canonical.BOOLEAN,
    "character varying": Canonical.VARCHAR, "varchar": Canonical.VARCHAR,
    "character": Canonical.VARCHAR, "char": Canonical.VARCHAR, "bpchar": Canonical.VARCHAR,
    "name": Canonical.VARCHAR,
    "text": Canonical.TEXT, "citext": Canonical.TEXT,
    "uuid": Canonical.UUID,
    "json": Canonical.JSON, "jsonb": Canonical.JSON,
    "timestamp without time zone": Canonical.TIMESTAMP, "timestamp": Canonical.TIMESTAMP,
    "timestamp with time zone": Canonical.TIMESTAMPTZ, "timestamptz": Canonical.TIMESTAMPTZ,
    "date": Canonical.DATE,
    "time without time zone": Canonical.TIME, "time with time zone": Canonical.TIME,
    "time": Canonical.TIME,
    "bytea": Canonical.BINARY,
}

_MYSQL: dict[str, Canonical] = {
    "int": Canonical.INTEGER, "integer": Canonical.INTEGER, "mediumint": Canonical.INTEGER,
    "year": Canonical.INTEGER,
    "bigint": Canonical.BIGINT,
    "smallint": Canonical.SMALLINT, "tinyint": Canonical.SMALLINT,
    "decimal": Canonical.NUMERIC, "numeric": Canonical.NUMERIC,
    "float": Canonical.REAL, "double": Canonical.REAL, "double precision": Canonical.REAL,
    "real": Canonical.REAL,
    "bit": Canonical.BOOLEAN, "bool": Canonical.BOOLEAN, "boolean": Canonical.BOOLEAN,
    "varchar": Canonical.VARCHAR, "char": Canonical.VARCHAR,
    "enum": Canonical.VARCHAR, "set": Canonical.VARCHAR,
    "text": Canonical.TEXT, "tinytext": Canonical.TEXT,
    "mediumtext": Canonical.TEXT, "longtext": Canonical.TEXT,
    "json": Canonical.JSON,
    "datetime": Canonical.TIMESTAMP, "timestamp": Canonical.TIMESTAMP,
    "date": Canonical.DATE,
    "time": Canonical.TIME,
    "blob": Canonical.BINARY, "tinyblob": Canonical.BINARY, "mediumblob": Canonical.BINARY,
    "longblob": Canonical.BINARY, "binary": Canonical.BINARY, "varbinary": Canonical.BINARY,
}

# MongoDB field types are sampled python type names (see schema_discovery).
_MONGO: dict[str, Canonical] = {
    "str": Canonical.TEXT,
    "objectid": Canonical.VARCHAR,
    "int": Canonical.BIGINT, "int32": Canonical.INTEGER, "int64": Canonical.BIGINT,
    "long": Canonical.BIGINT,
    "float": Canonical.REAL, "double": Canonical.REAL,
    "decimal128": Canonical.NUMERIC,
    "bool": Canonical.BOOLEAN,
    "datetime": Canonical.TIMESTAMP,
    "dict": Canonical.JSON, "list": Canonical.JSON,
    "bytes": Canonical.BINARY, "binary": Canonical.BINARY,
    "uuid": Canonical.UUID,
}


def _sqlite_canonical(native: str) -> Canonical:
    """SQLite is dynamically typed; map by its declared-type affinity rules."""
    t = (native or "").strip().upper()
    if t == "":
        return Canonical.TEXT
    if "INT" in t:
        return Canonical.BIGINT if "BIGINT" in t else Canonical.INTEGER
    if any(k in t for k in ("CHAR", "CLOB", "TEXT")):
        return Canonical.TEXT
    if "BLOB" in t:
        return Canonical.BINARY
    if "BOOL" in t:
        return Canonical.BOOLEAN
    if "UUID" in t:
        return Canonical.UUID
    if "JSON" in t:
        return Canonical.JSON
    if any(k in t for k in ("REAL", "FLOA", "DOUB")):
        return Canonical.REAL
    if "TIMESTAMP" in t or "DATETIME" in t:
        return Canonical.TIMESTAMP
    if "DATE" in t:
        return Canonical.DATE
    if "TIME" in t:
        return Canonical.TIME
    if any(k in t for k in ("DEC", "NUM", "MONEY")):
        return Canonical.NUMERIC
    return _FALLBACK


def to_canonical(db_type: DBType, native: str) -> Canonical:
    """Map a source engine's native type string to a canonical type."""
    if db_type == DBType.SQLITE:
        return _sqlite_canonical(native)
    n = _norm(native)
    if db_type == DBType.POSTGRES:
        return _POSTGRES.get(n, _FALLBACK)
    if db_type == DBType.MYSQL:
        return _MYSQL.get(n, _FALLBACK)
    if db_type == DBType.MONGODB:
        return _MONGO.get(n, _FALLBACK)
    return _FALLBACK


# ── Canonical → target DDL type ──────────────────────────────────
def _pg_type(c: Canonical, is_pk: bool) -> str:
    return {
        Canonical.TEXT: "text", Canonical.VARCHAR: "text",
        Canonical.INTEGER: "integer", Canonical.BIGINT: "bigint", Canonical.SMALLINT: "smallint",
        Canonical.BOOLEAN: "boolean", Canonical.REAL: "double precision",
        Canonical.NUMERIC: "numeric", Canonical.UUID: "uuid", Canonical.JSON: "jsonb",
        Canonical.TIMESTAMP: "timestamp", Canonical.TIMESTAMPTZ: "timestamptz",
        Canonical.DATE: "date", Canonical.TIME: "time", Canonical.BINARY: "bytea",
    }[c]


def _mysql_type(c: Canonical, is_pk: bool) -> str:
    # TEXT/BLOB cannot be a MySQL PRIMARY KEY without a prefix length; fall back
    # to a bounded, indexable type when the column is part of the key.
    if c == Canonical.TEXT:
        return "varchar(255)" if is_pk else "longtext"
    if c == Canonical.BINARY:
        return "varbinary(255)" if is_pk else "longblob"
    return {
        Canonical.VARCHAR: "varchar(255)",
        Canonical.INTEGER: "int", Canonical.BIGINT: "bigint", Canonical.SMALLINT: "smallint",
        Canonical.BOOLEAN: "tinyint(1)", Canonical.REAL: "double",
        Canonical.NUMERIC: "decimal(38,10)", Canonical.UUID: "char(36)", Canonical.JSON: "json",
        Canonical.TIMESTAMP: "datetime", Canonical.TIMESTAMPTZ: "datetime",
        Canonical.DATE: "date", Canonical.TIME: "time",
    }[c]


def _sqlite_type(c: Canonical, is_pk: bool) -> str:
    return {
        Canonical.TEXT: "TEXT", Canonical.VARCHAR: "TEXT",
        Canonical.INTEGER: "INTEGER", Canonical.BIGINT: "INTEGER", Canonical.SMALLINT: "INTEGER",
        Canonical.BOOLEAN: "INTEGER", Canonical.REAL: "REAL", Canonical.NUMERIC: "NUMERIC",
        Canonical.UUID: "TEXT", Canonical.JSON: "TEXT",
        Canonical.TIMESTAMP: "TEXT", Canonical.TIMESTAMPTZ: "TEXT",
        Canonical.DATE: "TEXT", Canonical.TIME: "TEXT", Canonical.BINARY: "BLOB",
    }[c]


_RENDER = {
    DBType.POSTGRES: _pg_type,
    DBType.MYSQL: _mysql_type,
    DBType.SQLITE: _sqlite_type,
}


# ── Identifier safety ────────────────────────────────────────────
def _validate_ident(name: str) -> str:
    if not _IDENT_RE.match(name or ""):
        raise ValueError(f"Unsafe identifier for DDL: {name!r}")
    return name


def _quote(name: str, db_type: DBType) -> str:
    ident = _validate_ident(name)
    return f"`{ident}`" if db_type == DBType.MYSQL else f'"{ident}"'


# ── Public API ───────────────────────────────────────────────────
@dataclass
class TargetColumnDef:
    name: str
    canonical: Canonical
    nullable: bool
    primary_key: bool


def plan_target_columns(
    field_pairs: list[tuple[str, str]],
    source_columns: dict[str, ColumnInfo],
    source_db_type: DBType,
) -> list[TargetColumnDef]:
    """Resolve the target column definitions for the copied ``(source, target)``
    field pairs, deriving each type from the matching source column."""
    defs: list[TargetColumnDef] = []
    seen: set[str] = set()
    for source_field, target_field in field_pairs:
        if target_field in seen:  # a mapping could collide two sources onto one target
            continue
        seen.add(target_field)

        src = source_columns.get(source_field)
        if src is not None:
            canonical = to_canonical(source_db_type, src.type)
            nullable = True if src.nullable is None else src.nullable
            primary_key = src.primary_key
        else:
            # Renamed/derived field with no matching source column metadata.
            canonical, nullable, primary_key = _FALLBACK, True, False

        # The engine coerces a Mongo ``_id`` to a scalar string, so the target
        # column must be a (short, indexable) string regardless of the sampled
        # python type.
        if source_db_type == DBType.MONGODB and source_field == "_id":
            canonical = Canonical.VARCHAR

        defs.append(TargetColumnDef(target_field, canonical, nullable, primary_key))
    return defs


def build_create_table_sql(
    target_db_type: DBType, table: str, columns: list[TargetColumnDef]
) -> str:
    """Build a ``CREATE TABLE IF NOT EXISTS`` statement for a SQL target."""
    render = _RENDER.get(target_db_type)
    if render is None:
        raise ValueError(f"Cannot generate DDL for target type: {target_db_type}")
    if not columns:
        raise ValueError("Cannot create a table with no columns.")

    tbl = _quote(table, target_db_type)
    pk_cols = [c for c in columns if c.primary_key]

    lines: list[str] = []
    for c in columns:
        line = f"  {_quote(c.name, target_db_type)} {render(c.canonical, c.primary_key)}"
        # A PK column is implicitly NOT NULL; only spell it out otherwise.
        if not c.nullable and not c.primary_key:
            line += " NOT NULL"
        lines.append(line)

    if pk_cols:
        pk_list = ", ".join(_quote(c.name, target_db_type) for c in pk_cols)
        lines.append(f"  PRIMARY KEY ({pk_list})")

    return f"CREATE TABLE IF NOT EXISTS {tbl} (\n" + ",\n".join(lines) + "\n)"
