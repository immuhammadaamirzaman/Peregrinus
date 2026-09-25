"""Migration job lifecycle: create, edit, start (enqueue), cancel, logs.

Access policy mirrors connections: ADMIN/GUEST read all; USER reads/mutates
only their own; GUEST cannot mutate (blocked at the router).
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import datetime, timezone

from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import (
    InvalidStateError,
    NotFoundError,
    PermissionDeniedError,
    ValidationError,
)
from app.models.enums import (
    STARTABLE_STATUSES,
    DBType,
    MigrationStatus,
    Role,
    TableStatus,
)
from app.models.migration import Migration
from app.models.migration_log import MigrationLog
from app.models.migration_table import MigrationTable
from app.models.user import User
from app.schemas.migration import MigrationCreate, MigrationTableSpec, MigrationUpdate
from app.services import connection_service


def _can_read_all(user: User) -> bool:
    return user.role in (Role.ADMIN, Role.GUEST)


def _make_tables(specs: list[MigrationTableSpec]) -> list[MigrationTable]:
    return [
        MigrationTable(
            source_table=spec.source_table,
            target_table=spec.target_table or spec.source_table,
            selected_columns=spec.selected_columns,
            column_mapping=spec.column_mapping,
            filters=[f.model_dump() for f in spec.filters] if spec.filters else None,
            order_index=index,
        )
        for index, spec in enumerate(specs)
    ]


async def _load(db: AsyncSession, migration_id: uuid.UUID) -> Migration | None:
    stmt = (
        select(Migration)
        .where(Migration.id == migration_id)
        .options(selectinload(Migration.tables))
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


# ── Read ─────────────────────────────────────────────────────────
async def list_migrations(db: AsyncSession, user: User) -> Sequence[Migration]:
    stmt = select(Migration).order_by(Migration.created_at.desc())
    if not _can_read_all(user):
        stmt = stmt.where(Migration.owner_id == user.id)
    result = await db.execute(stmt)
    return result.scalars().all()


async def get_readable(db: AsyncSession, migration_id: uuid.UUID, user: User) -> Migration:
    m = await _load(db, migration_id)
    if m is None or (not _can_read_all(user) and m.owner_id != user.id):
        raise NotFoundError("Migration not found.")
    return m


async def get_writable(db: AsyncSession, migration_id: uuid.UUID, user: User) -> Migration:
    m = await _load(db, migration_id)
    if m is None:
        raise NotFoundError("Migration not found.")
    if user.role != Role.ADMIN and m.owner_id != user.id:
        raise PermissionDeniedError("You can only modify your own migrations.")
    return m


# ── Create / update / delete ─────────────────────────────────────
async def create_migration(
    db: AsyncSession, data: MigrationCreate, owner: User
) -> Migration:
    # Use get_for_use (owner-or-admin), not get_readable: a migration will later
    # decrypt these connections' credentials and dial out, so referencing one is
    # a *credentialed* operation that a mere reader (e.g. guest) must not perform.
    source = await connection_service.get_for_use(db, data.source_connection_id, owner)
    target = await connection_service.get_for_use(db, data.target_connection_id, owner)

    # Mongo→SQL requires explicit columns: inferring them from a 100-doc sample
    # would silently drop fields absent from the sample (heterogeneous docs).
    if source.db_type == DBType.MONGODB and target.db_type != DBType.MONGODB:
        missing = [t.source_table for t in data.tables if not t.selected_columns]
        if missing:
            raise ValidationError(
                "MongoDB→SQL migrations require explicit selected_columns for each "
                f"collection (missing for: {', '.join(missing)})."
            )

    migration = Migration(
        name=data.name,
        description=data.description,
        source_connection_id=data.source_connection_id,
        target_connection_id=data.target_connection_id,
        status=MigrationStatus.DRAFT,
        options=data.options.model_dump(),
        owner_id=owner.id,
        tables=_make_tables(data.tables),
    )
    db.add(migration)
    await db.flush()
    return await get_readable(db, migration.id, owner)


async def update_migration(
    db: AsyncSession, migration_id: uuid.UUID, data: MigrationUpdate, user: User
) -> Migration:
    m = await get_writable(db, migration_id, user)
    updates = data.model_dump(exclude_unset=True)

    if "tables" in updates:
        if m.status != MigrationStatus.DRAFT:
            raise InvalidStateError("Tables can only be edited while the job is a draft.")
        m.tables = _make_tables(data.tables)  # type: ignore[arg-type]
        updates.pop("tables")

    if "options" in updates and data.options is not None:
        m.options = data.options.model_dump()
        updates.pop("options")

    for key, value in updates.items():
        setattr(m, key, value)

    await db.flush()
    return await get_readable(db, migration_id, user)


async def delete_migration(db: AsyncSession, migration_id: uuid.UUID, user: User) -> None:
    m = await get_writable(db, migration_id, user)
    if m.status in (MigrationStatus.PENDING, MigrationStatus.RUNNING):
        raise InvalidStateError("Cannot delete a migration that is queued or running.")
    await db.delete(m)


# ── Lifecycle ────────────────────────────────────────────────────
async def start_migration(db: AsyncSession, migration_id: uuid.UUID, user: User) -> Migration:
    m = await get_writable(db, migration_id, user)
    if m.status not in STARTABLE_STATUSES:
        raise InvalidStateError(
            f"Cannot start a migration in '{m.status}' state."
        )

    m.status = MigrationStatus.PENDING
    m.error_message = None
    m.finished_at = None
    # Resume semantics: keep completed tables DONE, reset the rest to PENDING.
    for table in m.tables:
        if table.status != TableStatus.DONE:
            table.status = TableStatus.PENDING
            table.error_message = None
    await db.flush()
    await db.commit()  # ensure the worker sees PENDING before it dequeues

    # Imported lazily to avoid a circular import at module load.
    from app.worker.tasks import run_migration

    try:
        # .delay() is a blocking broker round-trip — keep it off the event loop.
        async_result = await run_in_threadpool(run_migration.delay, str(m.id))
    except Exception as exc:
        # Compensate: never leave a committed PENDING row with no queued task.
        m.status = MigrationStatus.FAILED
        m.error_message = f"Failed to enqueue migration: {exc}"
        await db.commit()
        raise InvalidStateError(
            "Could not enqueue the migration (is the task broker running?)."
        ) from exc

    m.celery_task_id = async_result.id
    await db.commit()
    return await get_readable(db, migration_id, user)


async def cancel_migration(db: AsyncSession, migration_id: uuid.UUID, user: User) -> Migration:
    m = await get_writable(db, migration_id, user)
    if m.status not in (MigrationStatus.PENDING, MigrationStatus.RUNNING):
        raise InvalidStateError("Only queued or running migrations can be cancelled.")

    task_id = m.celery_task_id
    m.status = MigrationStatus.CANCELLED
    m.finished_at = datetime.now(timezone.utc)
    await db.flush()
    await db.commit()

    if task_id:
        import logging

        from app.worker.celery_app import celery_app

        # Best-effort: cancellation is already persisted (the running task also
        # checks status). A broker hiccup here must not fail the request, and
        # the blocking control call stays off the event loop.
        try:
            await run_in_threadpool(
                lambda: celery_app.control.revoke(task_id, terminate=False)
            )
        except Exception as exc:
            logging.getLogger(__name__).warning("revoke(%s) failed: %s", task_id, exc)
    return await get_readable(db, migration_id, user)


# ── Logs (historical + SSE backing query) ────────────────────────
async def get_logs(
    db: AsyncSession,
    migration_id: uuid.UUID,
    user: User,
    after_id: int = 0,
    limit: int = 200,
) -> Sequence[MigrationLog]:
    await get_readable(db, migration_id, user)  # authorize
    stmt = (
        select(MigrationLog)
        .where(MigrationLog.migration_id == migration_id, MigrationLog.id > after_id)
        .order_by(MigrationLog.id)
        .limit(limit)
    )
    result = await db.execute(stmt)
    return result.scalars().all()
