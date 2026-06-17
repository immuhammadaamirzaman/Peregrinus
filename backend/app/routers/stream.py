"""Server-Sent Events: live migration log + progress streaming.

Backed by polling ``migration_logs`` (``WHERE id > last_seen``), so it needs
no message bus. Each poll uses a short-lived session rather than the
request-scoped one, which would otherwise stay open for the whole stream.
"""

from __future__ import annotations

import asyncio
import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from app.config import settings
from app.core.deps import get_current_user
from app.database import AsyncSessionLocal, get_db
from app.models.enums import TERMINAL_STATUSES
from app.models.migration import Migration
from app.models.migration_log import MigrationLog
from app.models.user import User
from app.services import migration_service

router = APIRouter(prefix="/migrations", tags=["migrations"])

POLL_INTERVAL_SECONDS = 1.0
LOG_BATCH = 500

# Cap concurrent open SSE streams (each holds a poll loop) to bound resource use.
_active_streams = 0


async def _fetch_logs(migration_id: uuid.UUID, after_id: int) -> list[MigrationLog]:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(MigrationLog)
            .where(MigrationLog.migration_id == migration_id, MigrationLog.id > after_id)
            .order_by(MigrationLog.id)
            .limit(LOG_BATCH)
        )
        return list(result.scalars().all())


async def _fetch_progress(migration_id: uuid.UUID):
    async with AsyncSessionLocal() as session:
        row = await session.execute(
            select(
                Migration.status, Migration.processed_rows, Migration.total_rows
            ).where(Migration.id == migration_id)
        )
        return row.first()


@router.get("/{migration_id}/stream")
async def stream_migration(
    migration_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
) -> EventSourceResponse:
    global _active_streams
    # Authorize once up front using the request session.
    await migration_service.get_readable(db, migration_id, user)

    if _active_streams >= settings.max_sse_connections:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Too many active log streams; please try again shortly.",
        )
    _active_streams += 1

    async def event_generator():
        global _active_streams
        try:
            last_id = 0
            while True:
                if await request.is_disconnected():
                    break

                logs = await _fetch_logs(migration_id, last_id)
                for log in logs:
                    last_id = log.id
                    yield {
                        "event": "log",
                        "id": str(log.id),
                        "data": json.dumps(
                            {
                                "id": log.id,
                                "level": log.level.value,
                                "message": log.message,
                                "created_at": log.created_at.isoformat(),
                            }
                        ),
                    }

                progress = await _fetch_progress(migration_id)
                if progress is None:
                    break
                status_value, processed, total = progress
                yield {
                    "event": "status",
                    "data": json.dumps(
                        {
                            "status": status_value.value,
                            "processed_rows": processed,
                            "total_rows": total,
                        }
                    ),
                }

                # Terminal + no more pending logs → close the stream cleanly.
                if status_value in TERMINAL_STATUSES and not logs:
                    yield {"event": "end", "data": json.dumps({"status": status_value.value})}
                    break

                await asyncio.sleep(POLL_INTERVAL_SECONDS)
        finally:
            _active_streams -= 1

    return EventSourceResponse(event_generator())
