"""The migration Celery task.

Per table it: counts rows, generates a Redpanda Connect config (with
credentials injected via environment, never written to disk), spawns the
engine as a subprocess, streams its JSON logs into ``migration_logs``,
checkpoints progress, and supports cooperative cancellation.
"""

from __future__ import annotations

import json
import os
import queue
import subprocess
import tempfile
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import select

from app.config import settings
from app.database import SyncSessionLocal
from app.models.enums import DBType, LogLevel, MigrationStatus, Role, TableStatus, UserStatus
from app.models.migration import Migration
from app.models.migration_checkpoint import MigrationCheckpoint
from app.models.migration_log import MigrationLog
from app.models.migration_table import MigrationTable
from app.models.user import User
from app.services import connection_service, ddl_generator, schema_discovery, yaml_generator
from app.services.schema_discovery import ResolvedConnection
from app.services.yaml_generator import SOURCE_ENV, TARGET_ENV, TablePlan, build_dsn
from app.worker.celery_app import celery_app

# Poll for cancellation on this wall-clock interval (seconds), independent of
# how many log lines the engine emits.
CANCEL_CHECK_SECONDS = 2.0
MAX_LOG_MESSAGE = 4000


class _MigrationCancelled(Exception):
    """Internal signal that the job was cancelled by a user."""


# ── small helpers (sync) ─────────────────────────────────────────
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _log(db, migration_id: uuid.UUID, level: LogLevel, message: str, context: dict | None = None) -> None:
    db.add(
        MigrationLog(
            migration_id=migration_id,
            level=level,
            message=message[:MAX_LOG_MESSAGE],
            context=context,
        )
    )
    db.commit()


def _is_cancelled(migration_id: uuid.UUID) -> bool:
    """Check the latest committed status in a fresh session."""
    with SyncSessionLocal() as probe:
        status = probe.scalar(
            select(Migration.status).where(Migration.id == migration_id)
        )
    return status == MigrationStatus.CANCELLED


def _resolve_field_pairs(
    table: MigrationTable, source_rc: ResolvedConnection, target_is_sql: bool
) -> list[tuple[str, str]] | None:
    """Decide the (source, target) field pairs, discovering columns when the
    target is SQL and the user requested "all columns"."""
    mapping = table.column_mapping or {}

    if table.selected_columns:
        return [(s, mapping.get(s, s)) for s in table.selected_columns]

    if target_is_sql:
        cols = schema_discovery.list_columns(source_rc, table.source_table)
        return [(c.name, mapping.get(c.name, c.name)) for c in cols]

    return None  # MongoDB target: copy the whole document


def _upsert_checkpoint(db, migration_id: uuid.UUID, table_name: str, rows: int) -> None:
    cp = db.scalar(
        select(MigrationCheckpoint).where(
            MigrationCheckpoint.migration_id == migration_id,
            MigrationCheckpoint.table_name == table_name,
        )
    )
    if cp is None:
        cp = MigrationCheckpoint(migration_id=migration_id, table_name=table_name)
        db.add(cp)
    cp.last_offset = rows
    cp.rows_processed = rows
    db.commit()


def _authorize_execution(db, migration: Migration) -> None:
    """Re-authorize at execution time (defence in depth, independent of the
    create/start API): the job's owner must still be an APPROVED user and —
    unless an admin — must still own both referenced connections, otherwise we
    refuse to decrypt their credentials and dial out."""
    owner = db.get(User, migration.owner_id)
    if owner is None or owner.status != UserStatus.APPROVED:
        raise RuntimeError("Migration owner is no longer an approved user.")
    if owner.role != Role.ADMIN:
        for conn in (migration.source_connection, migration.target_connection):
            if conn is None or conn.owner_id != owner.id:
                raise RuntimeError(
                    "Migration owner is not permitted to use one of its connections."
                )


def _resolve_binary() -> Path:
    path = Path(settings.redpanda_connect_bin)
    if not path.is_absolute():
        path = Path.cwd() / path
    if not path.exists():
        raise FileNotFoundError(
            f"Redpanda Connect binary not found at '{path}'. Download it and set "
            "REDPANDA_CONNECT_BIN in .env (see README)."
        )
    return path


def _ensure_target_table(
    db,
    migration: Migration,
    table: MigrationTable,
    source_rc: ResolvedConnection,
    target_rc: ResolvedConnection,
    field_pairs: list[tuple[str, str]] | None,
    create_tables: bool,
) -> None:
    """Verify the target table exists, optionally creating it from the source
    schema. Fails the table with a clear error when it is missing and
    auto-create is disabled — so the engine never hangs on a missing relation.
    """
    # MongoDB collections are created implicitly on the first insert.
    if target_rc.db_type == DBType.MONGODB:
        return
    if schema_discovery.table_exists(target_rc, table.target_table):
        return

    def _fail(msg: str) -> None:
        table.status = TableStatus.FAILED
        table.error_message = msg
        db.commit()
        raise RuntimeError(msg)

    if not create_tables:
        _fail(
            f"Target table '{table.target_table}' does not exist. Enable the "
            "'Create tables' option to create it automatically from the source "
            "schema, or create it manually before running this migration."
        )

    if not field_pairs:  # SQL targets always resolve a concrete column list
        _fail(
            f"Cannot auto-create target table '{table.target_table}': no columns "
            "could be resolved from the source."
        )

    source_columns = {
        c.name: c for c in schema_discovery.list_columns(source_rc, table.source_table)
    }
    target_defs = ddl_generator.plan_target_columns(field_pairs, source_columns, source_rc.db_type)
    ddl = ddl_generator.build_create_table_sql(target_rc.db_type, table.target_table, target_defs)
    schema_discovery.execute_ddl(target_rc, ddl)
    _log(
        db, migration.id, LogLevel.INFO,
        f"Auto-created target table '{table.target_table}'.", {"ddl": ddl},
    )


# ── per-table execution ──────────────────────────────────────────
def _run_table(
    db,
    migration: Migration,
    table: MigrationTable,
    source_rc: ResolvedConnection,
    target_rc: ResolvedConnection,
    binary: Path,
    env: dict[str, str],
    create_tables: bool,
) -> None:
    """Copy a single table/collection. Raises on failure."""
    table.status = TableStatus.RUNNING
    table.error_message = None
    db.commit()
    _log(db, migration.id, LogLevel.INFO,
         f"Starting table '{table.source_table}' → '{table.target_table}'")

    target_is_sql = target_rc.db_type != DBType.MONGODB
    field_pairs = _resolve_field_pairs(table, source_rc, target_is_sql)

    # Preflight: make sure the target exists (creating it when requested)
    # *before* spawning the engine, so a missing table fails fast with a clear
    # message instead of an indefinite, silent engine retry loop.
    _ensure_target_table(db, migration, table, source_rc, target_rc, field_pairs, create_tables)

    # Count source rows for progress (best effort).
    try:
        total = schema_discovery.count_rows(source_rc, table.source_table, table.filters)
        table.rows_total = total
        migration.total_rows = (migration.total_rows or 0) + total
        db.commit()
    except Exception as exc:  # counting is non-fatal
        _log(db, migration.id, LogLevel.WARN, f"Could not count rows: {exc}")

    plan = TablePlan(
        source_db_type=source_rc.db_type,
        target_db_type=target_rc.db_type,
        source_table=table.source_table,
        target_table=table.target_table,
        source_database=source_rc.database,
        target_database=target_rc.database,
        field_pairs=field_pairs,
        filters=table.filters,
        batch_size=int(migration.options.get("batch_size", 1000)),
        max_in_flight=int(migration.options.get("max_in_flight", 64)),
        on_conflict=str(migration.options.get("on_conflict", "error")),
    )
    config_yaml = yaml_generator.render_yaml(plan)

    fd, tmp_path = tempfile.mkstemp(suffix=".yaml", prefix="dm_")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(config_yaml)

        returncode, last_error = _stream_engine(db, migration.id, binary, tmp_path, env)
    finally:
        try:
            os.remove(tmp_path)
        except OSError:
            pass

    if returncode != 0:
        table.status = TableStatus.FAILED
        table.error_message = last_error or f"Engine exited with code {returncode}"
        db.commit()
        raise RuntimeError(f"Table '{table.source_table}' failed: {table.error_message}")

    table.status = TableStatus.DONE
    table.rows_processed = table.rows_total
    migration.processed_rows = (migration.processed_rows or 0) + table.rows_processed
    db.commit()
    _upsert_checkpoint(db, migration.id, table.source_table, table.rows_processed)
    _log(db, migration.id, LogLevel.INFO, f"Completed table '{table.source_table}'")


def _stream_engine(
    db, migration_id: uuid.UUID, binary: Path, config_path: str, env: dict[str, str]
) -> tuple[int, str | None]:
    """Run the engine, streaming its logs into the DB.

    A reader thread feeds stdout into a queue so the main loop can poll for
    cancellation on a wall-clock interval, independent of how chatty the engine
    is. Returns (returncode, last_error). ``last_error`` prefers an ERROR-level
    line but falls back to the last non-empty line so non-JSON fatal output
    (e.g. a Go panic or config error) is still surfaced.
    """
    proc = subprocess.Popen(
        [str(binary), "run", config_path],
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    assert proc.stdout is not None

    line_queue: queue.Queue[str | None] = queue.Queue()

    def _reader() -> None:
        try:
            for raw in proc.stdout:  # type: ignore[union-attr]
                line_queue.put(raw)
        finally:
            line_queue.put(None)  # sentinel: stream closed

    reader = threading.Thread(target=_reader, daemon=True)
    reader.start()

    last_error: str | None = None
    last_line: str | None = None
    last_cancel_check = time.monotonic()

    try:
        while True:
            try:
                raw = line_queue.get(timeout=CANCEL_CHECK_SECONDS)
            except queue.Empty:
                raw = ""  # idle tick → fall through to the cancel check
            else:
                if raw is None:
                    break  # stream closed
                line = raw.rstrip("\n")
                if line:
                    last_line = line
                    level, message = _parse_log_line(line)
                    if level == LogLevel.ERROR:
                        last_error = message
                    _log(db, migration_id, level, message)

            now = time.monotonic()
            if now - last_cancel_check >= CANCEL_CHECK_SECONDS:
                last_cancel_check = now
                if _is_cancelled(migration_id):
                    proc.terminate()
                    try:
                        proc.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        proc.kill()
                    raise _MigrationCancelled()

        proc.wait()
        return proc.returncode, last_error or last_line
    finally:
        # Always release the subprocess + pipe FD, even on cancel/error, so the
        # long-lived worker never leaks file descriptors.
        if proc.poll() is None:
            proc.kill()
            proc.wait()
        if proc.stdout is not None:
            proc.stdout.close()
        reader.join(timeout=5)


def _parse_log_line(line: str) -> tuple[LogLevel, str]:
    """Parse a Benthos JSON log line into (level, message)."""
    try:
        data: dict[str, Any] = json.loads(line)
    except json.JSONDecodeError:
        return LogLevel.INFO, line
    raw_level = str(data.get("level", "info")).lower()
    level = {
        "trace": LogLevel.DEBUG,
        "debug": LogLevel.DEBUG,
        "info": LogLevel.INFO,
        "warn": LogLevel.WARN,
        "warning": LogLevel.WARN,
        "error": LogLevel.ERROR,
        "fatal": LogLevel.ERROR,
    }.get(raw_level, LogLevel.INFO)
    message = data.get("msg") or data.get("message") or line
    return level, str(message)


# ── the task ─────────────────────────────────────────────────────
@celery_app.task(bind=True, acks_late=True, max_retries=0, name="datamovers.run_migration")
def run_migration(self, migration_id_str: str) -> str:
    migration_id = uuid.UUID(migration_id_str)
    db = SyncSessionLocal()
    try:
        migration = db.get(Migration, migration_id)
        if migration is None:
            return "missing"
        # Only proceed from a queued state, or resume a crashed RUNNING job.
        if migration.status not in (MigrationStatus.PENDING, MigrationStatus.RUNNING):
            return f"skipped ({migration.status})"

        migration.status = MigrationStatus.RUNNING
        migration.started_at = migration.started_at or _now()
        migration.celery_task_id = self.request.id
        migration.error_message = None
        db.commit()

        try:
            _authorize_execution(db, migration)
            binary = _resolve_binary()
            source_rc = connection_service.resolve_connection(migration.source_connection)
            target_rc = connection_service.resolve_connection(migration.target_connection)
        except Exception as exc:
            migration.status = MigrationStatus.FAILED
            migration.error_message = str(exc)
            migration.finished_at = _now()
            db.commit()
            _log(db, migration_id, LogLevel.ERROR, str(exc))
            return "failed (setup)"

        # Hand the engine a MINIMAL environment — only the two DSNs plus the
        # OS essentials a subprocess needs — instead of os.environ.copy(), so
        # application secrets (ENCRYPTION_KEY, JWT_SECRET_KEY, POSTGRES_PASSWORD,
        # …) are never exposed to the Redpanda Connect process.
        env: dict[str, str] = {SOURCE_ENV: build_dsn(source_rc), TARGET_ENV: build_dsn(target_rc)}
        for key in ("PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "LANG", "TZ"):
            if (val := os.environ.get(key)) is not None:
                env[key] = val

        create_tables = bool(migration.options.get("create_tables", False))

        ordered = sorted(migration.tables, key=lambda t: t.order_index)
        try:
            for table in ordered:
                if _is_cancelled(migration_id):
                    raise _MigrationCancelled()
                if table.status == TableStatus.DONE:
                    continue
                _run_table(db, migration, table, source_rc, target_rc, binary, env, create_tables)
        except _MigrationCancelled:
            # Status already set to CANCELLED by the API; leave partial tables
            # PENDING so a later restart resumes them.
            for table in ordered:
                if table.status == TableStatus.RUNNING:
                    table.status = TableStatus.PENDING
            migration.finished_at = _now()
            db.commit()
            _log(db, migration_id, LogLevel.WARN, "Migration cancelled by user.")
            return "cancelled"
        except Exception as exc:
            migration.status = MigrationStatus.FAILED
            migration.error_message = str(exc)
            migration.finished_at = _now()
            db.commit()
            _log(db, migration_id, LogLevel.ERROR, f"Migration failed: {exc}")
            return "failed"

        migration.status = MigrationStatus.COMPLETED
        migration.finished_at = _now()
        db.commit()
        _log(db, migration_id, LogLevel.INFO, "Migration completed successfully.")
        return "completed"
    finally:
        db.close()
