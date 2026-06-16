"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-06-16

Creates: users, connections, migrations, migration_tables,
migration_logs, migration_checkpoints.
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ── Enum value sets (must mirror app.models.enums) ───────────────
ROLE = sa.Enum("admin", "user", "guest", name="role", native_enum=False, length=32)
USER_STATUS = sa.Enum(
    "pending", "approved", "rejected", "disabled",
    name="userstatus", native_enum=False, length=32,
)
DB_TYPE = sa.Enum(
    "postgres", "mysql", "mongodb", "sqlite", "mssql",
    name="dbtype", native_enum=False, length=32,
)
SSL_MODE = sa.Enum(
    "disable", "require", "verify-ca", "verify-full",
    name="sslmode", native_enum=False, length=32,
)
MIGRATION_STATUS = sa.Enum(
    "draft", "pending", "running", "completed", "failed", "cancelled",
    name="migrationstatus", native_enum=False, length=32,
)
TABLE_STATUS = sa.Enum(
    "pending", "running", "done", "failed", "skipped",
    name="tablestatus", native_enum=False, length=32,
)
LOG_LEVEL = sa.Enum(
    "debug", "info", "warn", "error",
    name="loglevel", native_enum=False, length=32,
)


def upgrade() -> None:
    # ── users ────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=True),
        sa.Column("role", ROLE, nullable=False),
        sa.Column("status", USER_STATUS, nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_users"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    # ── connections ──────────────────────────────────────────────
    op.create_table(
        "connections",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("db_type", DB_TYPE, nullable=False),
        sa.Column("host", sa.String(length=255), nullable=True),
        sa.Column("port", sa.Integer(), nullable=True),
        sa.Column("database_name", sa.String(length=255), nullable=False),
        sa.Column("username", sa.String(length=255), nullable=True),
        sa.Column("encrypted_password", sa.Text(), nullable=True),
        sa.Column("ssl_mode", SSL_MODE, nullable=False),
        sa.Column("extra_params", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_connections"),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["users.id"],
            name="fk_connections_owner_id_users", ondelete="CASCADE",
        ),
    )
    op.create_index("ix_connections_owner_id", "connections", ["owner_id"])

    # ── migrations ───────────────────────────────────────────────
    op.create_table(
        "migrations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("source_connection_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("target_connection_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", MIGRATION_STATUS, nullable=False),
        sa.Column("options", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("total_rows", sa.BigInteger(), nullable=False),
        sa.Column("processed_rows", sa.BigInteger(), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("celery_task_id", sa.String(length=64), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_migrations"),
        sa.ForeignKeyConstraint(
            ["owner_id"], ["users.id"],
            name="fk_migrations_owner_id_users", ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["source_connection_id"], ["connections.id"],
            name="fk_migrations_source_connection_id_connections", ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["target_connection_id"], ["connections.id"],
            name="fk_migrations_target_connection_id_connections", ondelete="RESTRICT",
        ),
    )
    op.create_index("ix_migrations_status", "migrations", ["status"])
    op.create_index("ix_migrations_owner_id", "migrations", ["owner_id"])

    # ── migration_tables ─────────────────────────────────────────
    op.create_table(
        "migration_tables",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("migration_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("source_table", sa.String(length=255), nullable=False),
        sa.Column("target_table", sa.String(length=255), nullable=False),
        sa.Column("selected_columns", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("column_mapping", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("filters", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.Column("status", TABLE_STATUS, nullable=False),
        sa.Column("rows_total", sa.BigInteger(), nullable=False),
        sa.Column("rows_processed", sa.BigInteger(), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_migration_tables"),
        sa.ForeignKeyConstraint(
            ["migration_id"], ["migrations.id"],
            name="fk_migration_tables_migration_id_migrations", ondelete="CASCADE",
        ),
    )
    op.create_index("ix_migration_tables_migration_id", "migration_tables", ["migration_id"])

    # ── migration_logs (monotonic BigInteger PK) ─────────────────
    op.create_table(
        "migration_logs",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("migration_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("level", LOG_LEVEL, nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("context", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_migration_logs"),
        sa.ForeignKeyConstraint(
            ["migration_id"], ["migrations.id"],
            name="fk_migration_logs_migration_id_migrations", ondelete="CASCADE",
        ),
    )
    op.create_index("ix_migration_logs_migration_id_id", "migration_logs", ["migration_id", "id"])

    # ── migration_checkpoints ────────────────────────────────────
    op.create_table(
        "migration_checkpoints",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("migration_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("table_name", sa.String(length=255), nullable=False),
        sa.Column("last_offset", sa.BigInteger(), nullable=False),
        sa.Column("rows_processed", sa.BigInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_migration_checkpoints"),
        sa.ForeignKeyConstraint(
            ["migration_id"], ["migrations.id"],
            name="fk_migration_checkpoints_migration_id_migrations", ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "migration_id", "table_name", name="uq_checkpoint_migration_table"
        ),
    )


def downgrade() -> None:
    op.drop_table("migration_checkpoints")
    op.drop_index("ix_migration_logs_migration_id_id", table_name="migration_logs")
    op.drop_table("migration_logs")
    op.drop_index("ix_migration_tables_migration_id", table_name="migration_tables")
    op.drop_table("migration_tables")
    op.drop_index("ix_migrations_owner_id", table_name="migrations")
    op.drop_index("ix_migrations_status", table_name="migrations")
    op.drop_table("migrations")
    op.drop_index("ix_connections_owner_id", table_name="connections")
    op.drop_table("connections")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
