"""Generate Redpanda Connect (Benthos) pipeline configs for a single
table/collection copy.

Security: the generated YAML never contains credentials. DSNs/URIs are
referenced via environment placeholders (``${DM_SOURCE_DSN}`` /
``${DM_TARGET_DSN}``) that the Celery task injects into the subprocess
environment, so secrets never touch disk. Filters are rendered with bound
parameters / programmatic Mongo queries (see ``app.services.filters``), never
as raw user predicates.

Phase 1 = full-dump copy between any pair of
{Postgres, MySQL, SQLite, Snowflake} ⇄ MongoDB.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from urllib.parse import quote

import yaml

from app.core import netguard
from app.models.enums import DBType, SSLMode
from app.services import filters
from app.services.schema_discovery import ResolvedConnection, snowflake_schema

SOURCE_ENV = "DM_SOURCE_DSN"
TARGET_ENV = "DM_TARGET_DSN"

# Snowflake's hard cap on expressions in a single list, which bounds how many
# bind placeholders one multi-row INSERT may carry (rows × columns).
SNOWFLAKE_MAX_BIND_EXPRESSIONS = 16_384

_SIMPLE_IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")

_BENTHOS_SQL_DRIVER = {
    DBType.POSTGRES: "postgres",
    DBType.MYSQL: "mysql",
    DBType.SQLITE: "sqlite",
    DBType.SNOWFLAKE: "snowflake",
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
        netguard.validate_outbound_host(rc.host)
        sslmode = "disable" if rc.ssl_mode == SSLMode.DISABLE else rc.ssl_mode.value
        return f"postgres://{auth}{rc.host}:{rc.effective_port}/{rc.database}?sslmode={sslmode}"

    if rc.db_type == DBType.MYSQL:
        netguard.validate_outbound_host(rc.host)
        # go-sql-driver/mysql DSN: user:pass@tcp(host:port)/db?params
        params = ["parseTime=true"]
        if rc.ssl_mode == SSLMode.REQUIRE:
            params.append("tls=skip-verify")
        elif rc.ssl_mode != SSLMode.DISABLE:
            params.append("tls=true")
        return f"{auth}tcp({rc.host}:{rc.effective_port})/{rc.database}?{'&'.join(params)}"

    if rc.db_type == DBType.SNOWFLAKE:
        # gosnowflake DSN (used by Redpanda Connect's `snowflake` driver):
        #   username[:password]@account_identifier/dbname/schemaname?params
        # No scheme and no host:port — the account identifier *is* the address.
        # Every segment is percent-encoded because the driver parses this as a
        # URL, so an unescaped '/' or '?' in a credential would silently
        # repoint the DSN.
        account = netguard.validate_snowflake_account(rc.host)
        warehouse = rc.extra_params.get("warehouse")
        if not warehouse:
            raise ValueError(
                "Snowflake connections require a 'warehouse' in extra_params."
            )
        userinfo = f"{user}:{pw}" if rc.password else user
        query = [f"warehouse={quote(str(warehouse), safe='')}"]
        if role := rc.extra_params.get("role"):
            query.append(f"role={quote(str(role), safe='')}")
        return (
            f"{userinfo}@{account}"
            f"/{quote(rc.database, safe='')}/{quote(snowflake_schema(rc), safe='')}"
            f"?{'&'.join(query)}"
        )

    if rc.db_type == DBType.SQLITE:
        return netguard.safe_sqlite_path(rc.database)  # confined file path

    if rc.db_type == DBType.MONGODB:
        if uri := rc.extra_params.get("uri"):
            netguard.validate_mongo_uri(uri)
            return str(uri)
        netguard.validate_outbound_host(rc.host)
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


def _effective_batch_size(plan: "TablePlan", column_count: int) -> int:
    """Batch rows per INSERT, capped to the target's bind-parameter limit.

    The engine turns a batch of N rows into one multi-row
    ``INSERT … VALUES (?,…),(?,…)`` statement, so the placeholder count is
    ``rows × columns``. Snowflake rejects more than 16,384 expressions in a
    list, so the default batch of 1,000 rows breaks on any table wider than 16
    columns with "maximum number of expressions in a list exceeded". Clamping
    the row count keeps wide tables working instead of failing mid-migration.
    """
    if plan.target_db_type != DBType.SNOWFLAKE or column_count <= 0:
        return plan.batch_size
    if column_count > SNOWFLAKE_MAX_BIND_EXPRESSIONS:
        # Not even one row fits, so no batch size can make this work. Say so
        # here rather than emitting a config that dies inside the engine.
        raise ValueError(
            f"Cannot copy {column_count} columns into Snowflake in one "
            f"statement: a single row already exceeds Snowflake's limit of "
            f"{SNOWFLAKE_MAX_BIND_EXPRESSIONS} expressions per list. Select "
            "fewer columns for this table."
        )
    return max(1, min(plan.batch_size, SNOWFLAKE_MAX_BIND_EXPRESSIONS // column_count))


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

    # Validate every source column identifier (same allowlist as targets) so a
    # crafted column name cannot inject into the engine's generated SELECT.
    # ``["*"]`` is the literal "all columns" case (no user input).
    if plan.field_pairs:
        columns = [_validate_sql_identifier(s) for s, _ in plan.field_pairs]
    else:
        columns = ["*"]
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
        "batching": {
            "count": _effective_batch_size(plan, len(target_cols)),
            "period": "1s",
        },
    }
    if plan.on_conflict == "skip":
        if plan.target_db_type == DBType.POSTGRES:
            insert["suffix"] = "ON CONFLICT DO NOTHING"
        elif plan.target_db_type == DBType.MYSQL:
            insert["options"] = ["IGNORE"]
        elif plan.target_db_type == DBType.SQLITE:
            insert["options"] = ["OR IGNORE"]
        elif plan.target_db_type == DBType.SNOWFLAKE:
            # Snowflake's INSERT has no ignore-on-conflict form (it does not
            # even enforce unique constraints), so "skip" cannot be honoured.
            # Silently inserting duplicates would be worse than refusing.
            raise ValueError(
                "on_conflict='skip' is not supported for a Snowflake target: "
                "Snowflake INSERT has no ignore-duplicates option. Use "
                "on_conflict='error' and truncate or de-duplicate the target "
                "table between runs."
            )
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
