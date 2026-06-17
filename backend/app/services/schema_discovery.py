"""Live introspection of source / target databases.

All functions here use **synchronous** drivers and are intended to be called
from the async layer via ``run_in_threadpool`` (or from Celery workers, which
are already synchronous). They never touch the ORM or crypto — callers pass a
fully-resolved :class:`ResolvedConnection` with the plaintext password.
"""

from __future__ import annotations

import re
import sqlite3
import time
from contextlib import closing
from dataclasses import dataclass, field
from typing import Any

from app.core import netguard
from app.core.exceptions import ConnectionTestError
from app.models.enums import DBType, SSLMode
from app.schemas.connection import ColumnInfo

# Fail fast on unreachable hosts instead of hanging the request/worker.
CONNECT_TIMEOUT_SECONDS = 5
MONGO_SAMPLE_SIZE = 100  # documents sampled to infer collection fields

DEFAULT_PORTS: dict[DBType, int] = {
    DBType.POSTGRES: 5432,
    DBType.MYSQL: 3306,
    DBType.MONGODB: 27017,
}

# Conservative identifier guard for table/collection names we interpolate.
_IDENTIFIER_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_$]*$")


@dataclass
class ResolvedConnection:
    """A connection with its password decrypted, ready to dial out."""

    db_type: DBType
    database: str
    host: str | None = None
    port: int | None = None
    username: str | None = None
    password: str | None = None
    ssl_mode: SSLMode = SSLMode.DISABLE
    extra_params: dict[str, Any] = field(default_factory=dict)

    @property
    def effective_port(self) -> int | None:
        return self.port or DEFAULT_PORTS.get(self.db_type)


def _require_supported(rc: ResolvedConnection) -> None:
    if rc.db_type == DBType.MSSQL:
        raise ConnectionTestError("MSSQL support is planned for a later phase.")


def _safe_identifier(name: str) -> str:
    """Validate an identifier we must interpolate into SQL (anti-injection)."""
    if not _IDENTIFIER_RE.match(name):
        raise ConnectionTestError(f"Unsafe or invalid table identifier: {name!r}")
    return name


# ╔════════════════════════════════════════════════════════════════╗
# ║  Per-driver connection helpers                                   ║
# ╚════════════════════════════════════════════════════════════════╝
def _connect_postgres(rc: ResolvedConnection):
    import psycopg2

    netguard.validate_outbound_host(rc.host)
    sslmode = "disable" if rc.ssl_mode == SSLMode.DISABLE else rc.ssl_mode.value
    kwargs: dict[str, Any] = {
        "host": rc.host,
        "port": rc.effective_port,
        "dbname": rc.database,
        "user": rc.username,
        "password": rc.password,
        "connect_timeout": CONNECT_TIMEOUT_SECONDS,
        "sslmode": sslmode,
    }
    if rootcert := rc.extra_params.get("sslrootcert"):
        kwargs["sslrootcert"] = netguard.safe_cert_path(rootcert)
    return psycopg2.connect(**kwargs)


def _connect_mysql(rc: ResolvedConnection):
    import pymysql

    netguard.validate_outbound_host(rc.host)
    ssl_arg: dict[str, Any] | None = None
    if rc.ssl_mode != SSLMode.DISABLE:
        ssl_arg = {}
        if ca := rc.extra_params.get("ssl_ca"):
            ssl_arg["ca"] = netguard.safe_cert_path(ca)
    return pymysql.connect(
        host=rc.host,
        port=rc.effective_port,
        database=rc.database,
        user=rc.username,
        password=rc.password or "",
        connect_timeout=CONNECT_TIMEOUT_SECONDS,
        read_timeout=30,
        ssl=ssl_arg,
        cursorclass=pymysql.cursors.Cursor,
    )


def _connect_sqlite(rc: ResolvedConnection):
    # ``database`` holds the file path for SQLite; confine it to the jail dir
    # so a user cannot read/create arbitrary files on the server filesystem.
    return sqlite3.connect(
        netguard.safe_sqlite_path(rc.database), timeout=CONNECT_TIMEOUT_SECONDS
    )


def _mongo_client(rc: ResolvedConnection):
    from pymongo import MongoClient

    if uri := rc.extra_params.get("uri"):
        netguard.validate_mongo_uri(uri)
        client = MongoClient(uri, serverSelectionTimeoutMS=CONNECT_TIMEOUT_SECONDS * 1000)
    else:
        netguard.validate_outbound_host(rc.host)
        client = MongoClient(
            host=rc.host,
            port=rc.effective_port,
            username=rc.username or None,
            password=rc.password or None,
            authSource=rc.extra_params.get("authSource", "admin"),
            tls=rc.ssl_mode != SSLMode.DISABLE,
            serverSelectionTimeoutMS=CONNECT_TIMEOUT_SECONDS * 1000,
        )
    return client


# ╔════════════════════════════════════════════════════════════════╗
# ║  Public operations (dispatch on db_type)                         ║
# ╚════════════════════════════════════════════════════════════════╝
def test_connection(rc: ResolvedConnection) -> tuple[str | None, float]:
    """Return (server_version, latency_ms). Raises ConnectionTestError."""
    _require_supported(rc)
    start = time.perf_counter()
    try:
        if rc.db_type == DBType.MONGODB:
            client = _mongo_client(rc)
            try:
                info = client.server_info()
                version = info.get("version")
            finally:
                client.close()
        elif rc.db_type == DBType.SQLITE:
            with closing(_connect_sqlite(rc)) as conn, closing(conn.cursor()) as cur:
                cur.execute("SELECT sqlite_version()")
                version = cur.fetchone()[0]
        else:
            connect = _connect_postgres if rc.db_type == DBType.POSTGRES else _connect_mysql
            with closing(connect(rc)) as conn, closing(conn.cursor()) as cur:
                cur.execute("SELECT version()")
                version = cur.fetchone()[0]
    except ConnectionTestError:
        raise
    except Exception as exc:  # driver-specific errors → uniform message
        raise ConnectionTestError(f"Connection failed: {exc}") from exc

    latency_ms = round((time.perf_counter() - start) * 1000, 2)
    return version, latency_ms


def list_tables(rc: ResolvedConnection) -> list[str]:
    """List table (SQL) or collection (Mongo) names."""
    _require_supported(rc)
    try:
        if rc.db_type == DBType.POSTGRES:
            schema = rc.extra_params.get("schema", "public")
            with closing(_connect_postgres(rc)) as conn, closing(conn.cursor()) as cur:
                cur.execute(
                    "SELECT table_name FROM information_schema.tables "
                    "WHERE table_schema = %s AND table_type = 'BASE TABLE' "
                    "ORDER BY table_name",
                    (schema,),
                )
                return [r[0] for r in cur.fetchall()]

        if rc.db_type == DBType.MYSQL:
            with closing(_connect_mysql(rc)) as conn, closing(conn.cursor()) as cur:
                cur.execute(
                    "SELECT table_name FROM information_schema.tables "
                    "WHERE table_schema = %s AND table_type = 'BASE TABLE' "
                    "ORDER BY table_name",
                    (rc.database,),
                )
                return [r[0] for r in cur.fetchall()]

        if rc.db_type == DBType.SQLITE:
            with closing(_connect_sqlite(rc)) as conn, closing(conn.cursor()) as cur:
                cur.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' "
                    "AND name NOT LIKE 'sqlite_%' ORDER BY name"
                )
                return [r[0] for r in cur.fetchall()]

        if rc.db_type == DBType.MONGODB:
            client = _mongo_client(rc)
            try:
                return sorted(client[rc.database].list_collection_names())
            finally:
                client.close()
    except ConnectionTestError:
        raise
    except Exception as exc:
        raise ConnectionTestError(f"Failed to list tables: {exc}") from exc

    raise ConnectionTestError(f"Unsupported database type: {rc.db_type}")


def list_columns(rc: ResolvedConnection, table: str) -> list[ColumnInfo]:
    """List columns (SQL) or sampled fields (Mongo) for one table/collection."""
    _require_supported(rc)
    try:
        if rc.db_type == DBType.POSTGRES:
            return _postgres_columns(rc, table)
        if rc.db_type == DBType.MYSQL:
            return _mysql_columns(rc, table)
        if rc.db_type == DBType.SQLITE:
            return _sqlite_columns(rc, table)
        if rc.db_type == DBType.MONGODB:
            return _mongo_fields(rc, table)
    except ConnectionTestError:
        raise
    except Exception as exc:
        raise ConnectionTestError(f"Failed to inspect '{table}': {exc}") from exc

    raise ConnectionTestError(f"Unsupported database type: {rc.db_type}")


def count_rows(rc: ResolvedConnection, table: str, conditions: list[dict] | None = None) -> int:
    """Count rows/documents, honouring an optional structured filter.

    Filters are rendered with bound parameters (SQL) or a programmatic query
    document (Mongo) — never raw user predicates.
    """
    from app.services import filters  # local import avoids a cycle

    _require_supported(rc)
    try:
        if rc.db_type == DBType.MONGODB:
            client = _mongo_client(rc)
            try:
                coll = client[rc.database][table]
                query = filters.render_mongo(conditions)
                if query:
                    return coll.count_documents(query)
                return coll.estimated_document_count()
            finally:
                client.close()

        ident = _safe_identifier(table)
        if rc.db_type == DBType.MYSQL:
            quoted, connect = f"`{ident}`", _connect_mysql
        elif rc.db_type == DBType.POSTGRES:
            quoted, connect = f'"{ident}"', _connect_postgres
        else:  # sqlite
            quoted, connect = f'"{ident}"', _connect_sqlite

        where, params = filters.render_native_sql(conditions, rc.db_type)
        sql = f"SELECT COUNT(*) FROM {quoted}"
        if where:
            sql += f" WHERE {where}"
        with closing(connect(rc)) as conn, closing(conn.cursor()) as cur:
            cur.execute(sql, params)
            return int(cur.fetchone()[0])
    except ConnectionTestError:
        raise
    except Exception as exc:
        raise ConnectionTestError(f"Failed to count rows in '{table}': {exc}") from exc


def table_exists(rc: ResolvedConnection, table: str) -> bool:
    """True if the SQL table (or Mongo collection) already exists."""
    _require_supported(rc)
    try:
        if rc.db_type == DBType.MONGODB:
            client = _mongo_client(rc)
            try:
                return table in client[rc.database].list_collection_names()
            finally:
                client.close()

        ident = _safe_identifier(table)
        if rc.db_type == DBType.POSTGRES:
            schema = rc.extra_params.get("schema", "public")
            with closing(_connect_postgres(rc)) as conn, closing(conn.cursor()) as cur:
                cur.execute(
                    "SELECT 1 FROM information_schema.tables "
                    "WHERE table_schema = %s AND table_name = %s",
                    (schema, ident),
                )
                return cur.fetchone() is not None

        if rc.db_type == DBType.MYSQL:
            with closing(_connect_mysql(rc)) as conn, closing(conn.cursor()) as cur:
                cur.execute(
                    "SELECT 1 FROM information_schema.tables "
                    "WHERE table_schema = %s AND table_name = %s",
                    (rc.database, ident),
                )
                return cur.fetchone() is not None

        if rc.db_type == DBType.SQLITE:
            with closing(_connect_sqlite(rc)) as conn, closing(conn.cursor()) as cur:
                cur.execute(
                    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
                    (ident,),
                )
                return cur.fetchone() is not None
    except ConnectionTestError:
        raise
    except Exception as exc:
        raise ConnectionTestError(f"Failed to check whether '{table}' exists: {exc}") from exc

    raise ConnectionTestError(f"Unsupported database type: {rc.db_type}")


def execute_ddl(rc: ResolvedConnection, statement: str) -> None:
    """Execute a single DDL statement against a SQL target and commit.

    Intended for the ``CREATE TABLE`` produced by
    :mod:`app.services.ddl_generator`. Not valid for MongoDB (collections are
    created implicitly on first write).
    """
    _require_supported(rc)
    connect = {
        DBType.POSTGRES: _connect_postgres,
        DBType.MYSQL: _connect_mysql,
        DBType.SQLITE: _connect_sqlite,
    }.get(rc.db_type)
    if connect is None:
        raise ConnectionTestError(f"Cannot execute DDL against {rc.db_type}.")
    try:
        with closing(connect(rc)) as conn, closing(conn.cursor()) as cur:
            cur.execute(statement)
            conn.commit()
    except Exception as exc:
        raise ConnectionTestError(f"Failed to create target table: {exc}") from exc


# ── SQL column introspection ─────────────────────────────────────
def _postgres_columns(rc: ResolvedConnection, table: str) -> list[ColumnInfo]:
    schema = rc.extra_params.get("schema", "public")
    with closing(_connect_postgres(rc)) as conn, closing(conn.cursor()) as cur:
        cur.execute(
            """
            SELECT c.column_name, c.data_type, c.is_nullable,
                   COALESCE(pk.is_pk, false)
            FROM information_schema.columns c
            LEFT JOIN (
                SELECT kcu.column_name, true AS is_pk
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                  ON tc.constraint_name = kcu.constraint_name
                 AND tc.table_schema = kcu.table_schema
                WHERE tc.constraint_type = 'PRIMARY KEY'
                  AND tc.table_schema = %s AND tc.table_name = %s
            ) pk ON pk.column_name = c.column_name
            WHERE c.table_schema = %s AND c.table_name = %s
            ORDER BY c.ordinal_position
            """,
            (schema, table, schema, table),
        )
        rows = cur.fetchall()
    if not rows:
        raise ConnectionTestError(f"Table '{table}' not found or has no columns.")
    return [
        ColumnInfo(name=r[0], type=r[1], nullable=(r[2] == "YES"), primary_key=bool(r[3]))
        for r in rows
    ]


def _mysql_columns(rc: ResolvedConnection, table: str) -> list[ColumnInfo]:
    with closing(_connect_mysql(rc)) as conn, closing(conn.cursor()) as cur:
        cur.execute(
            "SELECT column_name, data_type, is_nullable, column_key "
            "FROM information_schema.columns "
            "WHERE table_schema = %s AND table_name = %s "
            "ORDER BY ordinal_position",
            (rc.database, table),
        )
        rows = cur.fetchall()
    if not rows:
        raise ConnectionTestError(f"Table '{table}' not found or has no columns.")
    return [
        ColumnInfo(
            name=r[0], type=r[1], nullable=(r[2] == "YES"), primary_key=(r[3] == "PRI")
        )
        for r in rows
    ]


def _sqlite_columns(rc: ResolvedConnection, table: str) -> list[ColumnInfo]:
    ident = _safe_identifier(table)
    with closing(_connect_sqlite(rc)) as conn, closing(conn.cursor()) as cur:
        cur.execute(f'PRAGMA table_info("{ident}")')
        rows = cur.fetchall()  # (cid, name, type, notnull, dflt, pk)
    if not rows:
        raise ConnectionTestError(f"Table '{table}' not found or has no columns.")
    return [
        ColumnInfo(
            name=r[1], type=r[2] or "", nullable=(r[3] == 0), primary_key=(r[5] > 0)
        )
        for r in rows
    ]


# ── MongoDB field sampling ───────────────────────────────────────
def _mongo_fields(rc: ResolvedConnection, collection: str) -> list[ColumnInfo]:
    client = _mongo_client(rc)
    try:
        coll = client[rc.database][collection]
        seen: dict[str, str] = {}
        for doc in coll.find({}, limit=MONGO_SAMPLE_SIZE):
            for key, value in doc.items():
                seen.setdefault(key, type(value).__name__)
    finally:
        client.close()
    if not seen:
        return [ColumnInfo(name="_id", type="ObjectId", primary_key=True)]
    return [
        ColumnInfo(name=k, type=v, primary_key=(k == "_id"))
        for k, v in sorted(seen.items())
    ]
