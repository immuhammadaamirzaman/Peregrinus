"""Migration job endpoints: CRUD, start, cancel, and historical logs."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_writer
from app.database import get_db
from app.models.user import User
from app.schemas.migration import (
    MigrationCreate,
    MigrationDetail,
    MigrationLogRead,
    MigrationRead,
    MigrationUpdate,
)
from app.services import migration_service

router = APIRouter(prefix="/migrations", tags=["migrations"])


@router.post("", response_model=MigrationDetail, status_code=status.HTTP_201_CREATED)
async def create_migration(
    data: MigrationCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_writer),
):
    return await migration_service.create_migration(db, data, user)


@router.get("", response_model=list[MigrationRead])
async def list_migrations(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return list(await migration_service.list_migrations(db, user))


@router.get("/{migration_id}", response_model=MigrationDetail)
async def get_migration(
    migration_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await migration_service.get_readable(db, migration_id, user)


@router.patch("/{migration_id}", response_model=MigrationDetail)
async def update_migration(
    migration_id: uuid.UUID,
    data: MigrationUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_writer),
):
    return await migration_service.update_migration(db, migration_id, data, user)


@router.delete("/{migration_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_migration(
    migration_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_writer),
):
    await migration_service.delete_migration(db, migration_id, user)


@router.post("/{migration_id}/start", response_model=MigrationDetail)
async def start_migration(
    migration_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_writer),
):
    return await migration_service.start_migration(db, migration_id, user)


@router.post("/{migration_id}/cancel", response_model=MigrationDetail)
async def cancel_migration(
    migration_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_writer),
):
    return await migration_service.cancel_migration(db, migration_id, user)


@router.get("/{migration_id}/logs", response_model=list[MigrationLogRead])
async def get_logs(
    migration_id: uuid.UUID,
    after_id: int = Query(0, ge=0, description="Return logs with id greater than this"),
    limit: int = Query(200, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return list(
        await migration_service.get_logs(db, migration_id, user, after_id, limit)
    )
