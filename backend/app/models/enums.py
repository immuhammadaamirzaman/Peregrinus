"""Enumerations shared across models, schemas and services.

All enums subclass ``str`` (via :class:`enum.StrEnum`) so they serialise
cleanly to JSON and persist as human-readable strings in the database.
"""

from __future__ import annotations

from enum import StrEnum


class Role(StrEnum):
    """Access-control roles."""

    ADMIN = "admin"     # full access + user management
    USER = "user"       # owns their own connections / migrations
    GUEST = "guest"     # read-only, cannot mutate anything


class UserStatus(StrEnum):
    """Account lifecycle. Sign-up creates a PENDING account that an
    admin must explicitly APPROVE before the user can log in."""

    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    DISABLED = "disabled"


class DBType(StrEnum):
    """Supported source / target database engines."""

    POSTGRES = "postgres"
    MYSQL = "mysql"
    MONGODB = "mongodb"
    SQLITE = "sqlite"
    MSSQL = "mssql"     # reserved — discovery/engine support lands in phase 2


# Engines with full phase-1 support (test + discovery + migrate).
SUPPORTED_DB_TYPES: frozenset[DBType] = frozenset(
    {DBType.POSTGRES, DBType.MYSQL, DBType.MONGODB, DBType.SQLITE}
)


class SSLMode(StrEnum):
    """TLS posture for a SQL connection (maps onto driver-specific flags)."""

    DISABLE = "disable"
    REQUIRE = "require"
    VERIFY_CA = "verify-ca"
    VERIFY_FULL = "verify-full"


class MigrationStatus(StrEnum):
    """Migration job lifecycle state machine.

    DRAFT → PENDING → RUNNING → COMPLETED
                          ├→ FAILED      (restartable; completed tables skipped)
                          └→ CANCELLED
    """

    DRAFT = "draft"
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


# States from which a job may be (re)started / enqueued.
STARTABLE_STATUSES: frozenset[MigrationStatus] = frozenset(
    {MigrationStatus.DRAFT, MigrationStatus.FAILED, MigrationStatus.CANCELLED}
)
# Terminal states.
TERMINAL_STATUSES: frozenset[MigrationStatus] = frozenset(
    {MigrationStatus.COMPLETED, MigrationStatus.FAILED, MigrationStatus.CANCELLED}
)


class TableStatus(StrEnum):
    """Per-table progress within a migration."""

    PENDING = "pending"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"
    SKIPPED = "skipped"


class LogLevel(StrEnum):
    DEBUG = "debug"
    INFO = "info"
    WARN = "warn"
    ERROR = "error"
