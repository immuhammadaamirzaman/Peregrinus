"""Generate Redpanda Connect (Benthos) pipeline configs for a single
table/collection copy.

Security: the generated YAML never contains credentials. DSNs/URIs are
referenced via environment placeholders (``${DM_SOURCE_DSN}`` /
``${DM_TARGET_DSN}``) that the Celery task injects into the subprocess
environment, so secrets never touch disk. Filters are rendered with bound
parameters / programmatic Mongo queries (see ``app.services.filters``), never
as raw user predicates.

Phase 1 = full-dump copy. Supports the four combinations of
{Postgres, MySQL, SQLite} ⇄ MongoDB.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from urllib.parse import quote

import yaml

from app.models.enums import DBType, SSLMode
from app.services import filters
from app.services.schema_discovery import ResolvedConnection

SOURCE_ENV = "DM_SOURCE_DSN"
TARGET_ENV = "DM_TARGET_DSN"

_SIMPLE_IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")

_BENTHOS_SQL_DRIVER = {
    DBType.POSTGRES: "postgres",
    DBType.MYSQL: "mysql",
    DBType.SQLITE: "sqlite",
    DBType.MSSQL: "mssql",
}


@dataclass
class TablePlan:
    """Fully-resolved instructions for copying one table/collection."""

    source_db_type: DBType
    target_db_type: DBType
    source_table: str
    target_table: str
    source_database: str
    target_database: str
    # (source_field, target_field) pairs. ``None`` means "copy everything"
    # (only valid when the target is MongoDB or the source is SQL with "*").
    field_pairs: list[tuple[str, str]] | None
    filters: list[dict] | None
    batch_size: int
    max_in_flight: int
    on_conflict: str = "error"


# ── DSN / URI construction (called with plaintext creds) ─────────
def build_dsn(rc: ResolvedConnection) -> str:
    """Build the driver-specific DSN/URI string for a resolved connection."""
    user = quote(rc.username or "", safe="")
    pw = quote(rc.password or "", safe="")
    auth = f"{user}:{pw}@" if rc.username else ""

    if rc.db_type == DBType.POSTGRES:
        sslmode = "disable" if rc.ssl_mode == SSLMode.DISABLE else rc.ssl_mode.value
        return f"postgres://{auth}{rc.host}:{rc.effective_port}/{rc.database}?sslmode={sslmode}"

    if rc.db_type == DBType.MYSQL:
        # go-sql-driver/mysql DSN: user:pass@tcp(host:port)/db?params
        params = ["parseTime=true"]
        if rc.ssl_mode == SSLMode.REQUIRE:
            params.append("tls=skip-verify")
        elif rc.ssl_mode != SSLMode.DISABLE:
            params.append("tls=true")
        return f"{auth}tcp({rc.host}:{rc.effective_port})/{rc.database}?{'&'.join(params)}"

    if rc.db_type == DBType.SQLITE:
        return rc.database  # file path

    if rc.db_type == DBType.MONGODB:
        if uri := rc.extra_params.get("uri"):
            return str(uri)
        query = [f"authSource={rc.extra_params.get('authSource', 'admin')}"]
        if rc.ssl_mode != SSLMode.DISABLE:
            query.append("tls=true")
        return f"mongodb://{auth}{rc.host}:{rc.effective_port}/?{'&'.join(query)}"

    raise ValueError(f"Unsupported database type for DSN: {rc.db_type}")


# ── Bloblang path helpers ────────────────────────────────────────
def _path(base: str, field_name: str) -> str:
    """A bloblang path like ``this.col`` or ``this."weird name"``."""
    if _SIMPLE_IDENT.match(field_name):
        return f"{base}.{field_name}"
    return f"{base}.{json.dumps(field_name)}"


def _id_coercion() -> str:
    """Robustly read a Mongo ``_id`` as a scalar for a SQL target.

    Handles ObjectId-as-{"$oid": "..."}, embedded-document ids, and plain
    scalar ids without relying on an error being raised.
    """
    return (
        'if this._id.type() == "object" '
        '{ this._id."$oid".or(this._id.string()) } else { this._id }'
    )


def _sql_arg(field_name: str, source_is_mongo: bool) -> str:
    """Bloblang expression producing one SQL bind value from a source field.

    For Mongo sources, ``_id`` is coerced to a scalar and nested
    objects/arrays are JSON-encoded (a SQL driver cannot bind a map/array).
    """
    if source_is_mongo and field_name == "_id":
        return _id_coercion()
    ref = _path("this", field_name)
    if source_is_mongo:
        return (
            f'if {ref}.type() == "object" || {ref}.type() == "array" '
            f'{{ {ref}.format_json() }} else {{ {ref} }}'
        )
    return ref


def _validate_sql_identifier(name: str) -> str:
    if not filters.SAFE_IDENT.match(name):
        raise ValueError(f"Unsafe SQL target column identifier: {name!r}")
    return name


# ── Component builders ───────────────────────────────────────────
def _build_input(plan: TablePlan) -> dict:
    if plan.source_db_type == DBType.MONGODB:
        query = filters.render_mongo(plan.filters)
        return {
            "mongodb": {
                "url": "${" + SOURCE_ENV + "}",
                "database": plan.source_database,
                "collection": plan.source_table,
                "operation": "find",
                "query": f"root = {json.dumps(query)}",
                "json_marshal_mode": "relaxed",
            }
        }

    columns = [s for s, _ in plan.field_pairs] if plan.field_pairs else ["*"]
    cfg: dict = {
        "driver": _BENTHOS_SQL_DRIVER[plan.source_db_type],
        "dsn": "${" + SOURCE_ENV + "}",
        "table": _validate_sql_identifier(plan.source_table),
        "columns": columns,
    }
    where, args = filters.render_engine_sql(plan.filters, plan.source_db_type)
    if where:
        cfg["where"] = where
        cfg["args_mapping"] = "root = [" + ", ".join(json.dumps(v) for v in args) + "]"
    return {"sql_select": cfg}


def _build_output(plan: TablePlan) -> dict:
    source_is_mongo = plan.source_db_type == DBType.MONGODB

    if plan.target_db_type == DBType.MONGODB:
        if plan.field_pairs is None:
            document_map = "root = this"
        else:
            document_map = "\n".join(
                f"{_path('root', t)} = {_path('this', s)}" for s, t in plan.field_pairs
            )
        return {
            "mongodb": {
                "url": "${" + TARGET_ENV + "}",
                "database": plan.target_database,
                "collection": plan.target_table,
                "operation": "insert-one",
                "document_map": document_map,
                "max_in_flight": plan.max_in_flight,
            }
        }

    # SQL target requires explicit columns + args_mapping.
    if plan.field_pairs is None:
        raise ValueError("SQL targets require an explicit column list.")
    target_cols = [_validate_sql_identifier(t) for _, t in plan.field_pairs]
    args = ", ".join(_sql_arg(s, source_is_mongo) for s, _ in plan.field_pairs)
    insert: dict = {
        "driver": _BENTHOS_SQL_DRIVER[plan.target_db_type],
        "dsn": "${" + TARGET_ENV + "}",
        "table": _validate_sql_identifier(plan.target_table),
        "columns": target_cols,
        "args_mapping": f"root = [ {args} ]",
        "max_in_flight": plan.max_in_flight,
        # ``period`` is essential: with ``count`` alone, the final partial
        # batch (any remainder < batch_size, including whole tables smaller
        # than batch_size) never reaches the count threshold and is never
        # flushed, so the engine hangs forever having written nothing. The
        # timer guarantees pending rows are flushed.
        "batching": {"count": plan.batch_size, "period": "1s"},
    }
    if plan.on_conflict == "skip":
        if plan.target_db_type == DBType.POSTGRES:
            insert["suffix"] = "ON CONFLICT DO NOTHING"
        elif plan.target_db_type == DBType.MYSQL:
            insert["options"] = ["IGNORE"]
        elif plan.target_db_type == DBType.SQLITE:
            insert["options"] = ["OR IGNORE"]
    return {"sql_insert": insert}


def build_config(plan: TablePlan) -> dict:
    """Assemble the full Redpanda Connect stream config as a dict."""
    return {
        # Disable the management/metrics HTTP server so concurrent runs don't
        # fight over :4195.
        "http": {"enabled": False},
        "logger": {"level": "INFO", "format": "json", "add_timestamp": True},
        "input": _build_input(plan),
        "output": _build_output(plan),
    }


def render_yaml(plan: TablePlan) -> str:
    """Render the config to a YAML string."""
    return yaml.safe_dump(build_config(plan), sort_keys=False, default_flow_style=False)
