"""Connection CRUD, live connectivity tests, and schema discovery."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_writer
from app.database import get_db
from app.models.user import User
from app.schemas.connection import (
    ConnectionCreate,
    ConnectionRead,
    ConnectionTestRequest,
    ConnectionTestResult,
    ConnectionUpdate,
    TableColumns,
    TableList,
)
from app.services import connection_service

router = APIRouter(prefix="/connections", tags=["connections"])


@router.post("", response_model=ConnectionRead, status_code=status.HTTP_201_CREATED)
async def create_connection(
    data: ConnectionCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_writer),
):
    return await connection_service.create_connection(db, data, user)


@router.get("", response_model=list[ConnectionRead])
async def list_connections(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return list(await connection_service.list_connections(db, user))


@router.post("/test", response_model=ConnectionTestResult)
async def test_config(
    data: ConnectionTestRequest,
    _: User = Depends(require_writer),
):
    """Test an unsaved connection config (used by the 'Test' button)."""
    return await connection_service.test_config(data)


@router.get("/{conn_id}", response_model=ConnectionRead)
async def get_connection(
    conn_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await connection_service.get_readable(db, conn_id, user)


@router.patch("/{conn_id}", response_model=ConnectionRead)
async def update_connection(
    conn_id: uuid.UUID,
    data: ConnectionUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_writer),
):
    return await connection_service.update_connection(db, conn_id, data, user)


@router.delete("/{conn_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_connection(
    conn_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_writer),
):
    await connection_service.delete_connection(db, conn_id, user)


@router.post("/{conn_id}/test", response_model=ConnectionTestResult)
async def test_existing(
    conn_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await connection_service.test_existing(db, conn_id, user)


@router.get("/{conn_id}/tables", response_model=TableList)
async def list_tables(
    conn_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await connection_service.discover_tables(db, conn_id, user)


@router.get("/{conn_id}/columns", response_model=TableColumns)
async def list_columns(
    conn_id: uuid.UUID,
    table: str = Query(..., min_length=1, description="Table or collection name"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await connection_service.discover_columns(db, conn_id, user, table)
