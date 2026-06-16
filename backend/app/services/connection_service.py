"""Connection persistence, credential encryption, access scoping, and
orchestration of live connectivity tests + schema discovery.

Access policy:
* ADMIN and GUEST may *read* every connection (guest is a read-only auditor).
* A regular USER may read/mutate only the connections they own.
* GUESTs never reach this layer for mutations — the router blocks them.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence

from fastapi.concurrency import run_in_threadpool
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import get_cipher
from app.core.exceptions import ConflictError, ConnectionTestError, NotFoundError, PermissionDeniedError
from app.models.connection import Connection
from app.models.enums import Role
from app.models.migration import Migration
from app.models.user import User
from app.schemas.connection import (
    ColumnInfo,
    ConnectionCreate,
    ConnectionTestRequest,
    ConnectionTestResult,
    ConnectionUpdate,
    TableColumns,
    TableList,
)
from app.services import schema_discovery
from app.services.schema_discovery import ResolvedConnection


def _can_read_all(user: User) -> bool:
    return user.role in (Role.ADMIN, Role.GUEST)


def resolve_connection(conn: Connection) -> ResolvedConnection:
    """Public alias of :func:`_resolve` for the Celery worker."""
    return _resolve(conn)


def _resolve(conn: Connection) -> ResolvedConnection:
    """Decrypt the stored credential and build a dial-out config."""
    password = (
        get_cipher().decrypt(conn.encrypted_password)
        if conn.encrypted_password
        else None
    )
    return ResolvedConnection(
        db_type=conn.db_type,
        database=conn.database_name,
        host=conn.host,
        port=conn.port,
        username=conn.username,
        password=password,
        ssl_mode=conn.ssl_mode,
        extra_params=conn.extra_params or {},
    )


def _resolve_request(data: ConnectionTestRequest) -> ResolvedConnection:
    return ResolvedConnection(
        db_type=data.db_type,
        database=data.database_name,
        host=data.host,
        port=data.port,
        username=data.username,
        password=data.password,
        ssl_mode=data.ssl_mode,
        extra_params=data.extra_params or {},
    )


# ── CRUD ─────────────────────────────────────────────────────────
async def create_connection(
    db: AsyncSession, data: ConnectionCreate, owner: User
) -> Connection:
    conn = Connection(
        name=data.name,
        db_type=data.db_type,
        host=data.host,
        port=data.port,
        database_name=data.database_name,
        username=data.username,
        encrypted_password=get_cipher().encrypt(data.password) if data.password else None,
        ssl_mode=data.ssl_mode,
        extra_params=data.extra_params,
        owner_id=owner.id,
    )
    db.add(conn)
    await db.flush()
    await db.refresh(conn)
    return conn


async def list_connections(db: AsyncSession, user: User) -> Sequence[Connection]:
    stmt = select(Connection).order_by(Connection.created_at.desc())
    if not _can_read_all(user):
        stmt = stmt.where(Connection.owner_id == user.id)
    result = await db.execute(stmt)
    return result.scalars().all()


async def get_readable(db: AsyncSession, conn_id: uuid.UUID, user: User) -> Connection:
    conn = await db.get(Connection, conn_id)
    if conn is None or (not _can_read_all(user) and conn.owner_id != user.id):
        raise NotFoundError("Connection not found.")
    return conn


async def get_writable(db: AsyncSession, conn_id: uuid.UUID, user: User) -> Connection:
    conn = await db.get(Connection, conn_id)
    if conn is None:
        raise NotFoundError("Connection not found.")
    if user.role != Role.ADMIN and conn.owner_id != user.id:
        raise PermissionDeniedError("You can only modify your own connections.")
    return conn


async def get_for_use(db: AsyncSession, conn_id: uuid.UUID, user: User) -> Connection:
    """Owner-or-admin access for *credentialed* operations (live test / schema
    discovery), which decrypt and use the stored password to dial out.

    Distinct from :func:`get_readable` (metadata-only): a GUEST or another user
    must NOT be able to drive outbound connections with someone else's secret.
    """
    conn = await db.get(Connection, conn_id)
    if conn is None:
        raise NotFoundError("Connection not found.")
    if user.role != Role.ADMIN and conn.owner_id != user.id:
        raise PermissionDeniedError("You can only use your own connections.")
    return conn


async def update_connection(
    db: AsyncSession, conn_id: uuid.UUID, data: ConnectionUpdate, user: User
) -> Connection:
    conn = await get_writable(db, conn_id, user)
    updates = data.model_dump(exclude_unset=True)

    if "password" in updates:
        raw = updates.pop("password")
        conn.encrypted_password = get_cipher().encrypt(raw) if raw else None

    for key, value in updates.items():
        setattr(conn, key, value)
    await db.flush()
    await db.refresh(conn)
    return conn


async def delete_connection(db: AsyncSession, conn_id: uuid.UUID, user: User) -> None:
    conn = await get_writable(db, conn_id, user)
    # ON DELETE RESTRICT protects this at the DB level; check first for a
    # friendly error instead of an IntegrityError.
    refs = await db.scalar(
        select(func.count())
        .select_from(Migration)
        .where(
            or_(
                Migration.source_connection_id == conn_id,
                Migration.target_connection_id == conn_id,
            )
        )
    )
    if refs:
        raise ConflictError(
            "This connection is used by one or more migrations and cannot be deleted."
        )
    await db.delete(conn)


# ── Connectivity tests ───────────────────────────────────────────
async def _run_test(rc: ResolvedConnection) -> ConnectionTestResult:
    try:
        version, latency = await run_in_threadpool(schema_discovery.test_connection, rc)
        return ConnectionTestResult(
            ok=True, message="Connection successful.",
            server_version=version, latency_ms=latency,
        )
    except ConnectionTestError as exc:
        # Return a clean 200 result so the UI can display the failure inline.
        return ConnectionTestResult(ok=False, message=exc.detail)


async def test_config(data: ConnectionTestRequest) -> ConnectionTestResult:
    return await _run_test(_resolve_request(data))


async def test_existing(
    db: AsyncSession, conn_id: uuid.UUID, user: User
) -> ConnectionTestResult:
    conn = await get_for_use(db, conn_id, user)
    return await _run_test(_resolve(conn))


# ── Schema discovery ─────────────────────────────────────────────
async def discover_tables(
    db: AsyncSession, conn_id: uuid.UUID, user: User
) -> TableList:
    conn = await get_for_use(db, conn_id, user)
    rc = _resolve(conn)
    tables = await run_in_threadpool(schema_discovery.list_tables, rc)
    return TableList(db_type=conn.db_type, database=conn.database_name, tables=tables)


async def discover_columns(
    db: AsyncSession, conn_id: uuid.UUID, user: User, table: str
) -> TableColumns:
    conn = await get_for_use(db, conn_id, user)
    rc = _resolve(conn)
    columns: list[ColumnInfo] = await run_in_threadpool(
        schema_discovery.list_columns, rc, table
    )
    return TableColumns(table=table, columns=columns)
