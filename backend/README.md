# DataMovers — Backend

Move data between databases (PostgreSQL ⇄ MySQL ⇄ MongoDB ⇄ SQLite) using a
[Redpanda Connect](https://github.com/redpanda-data/connect) engine, driven by
a FastAPI control plane with JWT auth, role-based access, and Celery-backed
background jobs.

## Architecture

```
React (frontend)  →  FastAPI (REST + SSE)  →  Celery (Redis/Memurai)  →  Redpanda Connect (subprocess)
                            │                                                      │
                            └────────────  PostgreSQL (metadata)  ←───────────────┘
```

* **FastAPI** — auth, connection management, schema discovery, job control, live log streaming (SSE).
* **PostgreSQL** — metadata only (users, connections, migrations, logs, checkpoints). User data is never stored here.
* **Celery + Memurai** — runs migrations in the background, crash-safe (`acks_late`).
* **Redpanda Connect** — the actual data-movement engine; configs are generated per-table at runtime.

## Prerequisites

| Component | Notes |
|---|---|
| Python 3.12 | C-extension deps (asyncpg, psycopg2, bcrypt, cryptography) have reliable 3.12 wheels |
| PostgreSQL | The metadata store (already installed: v18) |
| [Memurai](https://www.memurai.com/) | Redis-compatible broker for Celery (Windows, no Docker) |
| [Redpanda Connect binary](https://github.com/redpanda-data/connect/releases) | Download and place at `bin/rpk-connect.exe` |

## Setup

```powershell
# 1. From the backend/ directory — create the venv and install deps
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt

# 2. Create the metadata database (run as the postgres superuser)
#    Edit the password inside the script first to match your .env.
psql -U postgres -f scripts/bootstrap_db.sql

# 3. Create .env and generate secrets
copy .env.example .env
.\.venv\Scripts\python.exe scripts/generate_keys.py   # paste output into .env
#    Then set POSTGRES_PASSWORD, FIRST_ADMIN_* etc. in .env

# 4. Apply database migrations
.\.venv\Scripts\python.exe -m alembic upgrade head

# 5. Download the Redpanda Connect binary into bin\rpk-connect.exe
#    (or set REDPANDA_CONNECT_BIN to wherever you put it)

# 6. Run the API
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload

# 7. In a second terminal, run the Celery worker (solo pool on Windows)
.\.venv\Scripts\celery.exe -A app.worker.celery_app worker --pool=solo --loglevel=info
```

API docs: <http://localhost:8000/docs> · Health: <http://localhost:8000/health>

## First login

On first startup (with an empty `users` table) the app seeds an admin from
`FIRST_ADMIN_EMAIL` / `FIRST_ADMIN_PASSWORD`. Log in via `POST /api/v1/auth/login`
(OAuth2 form: `username` = email). **Change this password immediately.**

## Roles

| Role | Capabilities |
|---|---|
| `admin` | Everything + user management (approve sign-ups, change roles) |
| `user` | Create/run/manage **their own** connections and migrations |
| `guest` | Read-only across all resources; cannot mutate anything |

New sign-ups (`POST /api/v1/auth/register`) are created `pending` and require
admin approval (`PATCH /api/v1/users/{id}/status` → `approved`) before they can log in.

## Security

* **Credentials at rest** — DB passwords are Fernet-encrypted (`ENCRYPTION_KEY`); never returned by the API.
* **Credentials in transit** — per-connection `ssl_mode` (Postgres `sslmode`, MySQL TLS, Mongo TLS).
* **No secrets on disk** — generated Redpanda Connect YAML references `${DM_SOURCE_DSN}`/`${DM_TARGET_DSN}`; the real DSNs are injected as subprocess env vars and the temp config is deleted immediately after each run.
* **JWT** — short-lived access tokens (15 min) + refresh tokens (7 days), HS256.

## Phase 1 scope & limitations

* **Full-dump** copy only (no incremental/CDC yet).
* Supported engines: Postgres, MySQL, MongoDB, SQLite (MSSQL reserved for a later phase).
* **Target tables/collections must already exist** — the engine inserts, it does not create target schema.
* **Filters are structured, not raw SQL**: each table accepts a list of `{column, op, value}` conditions (ops: `eq, ne, gt, gte, lt, lte, like, in, nin`), rendered with bound parameters — no SQL/NoSQL injection surface.
* **Resume is table-level**: completed tables are skipped on restart; an interrupted table is re-copied from the start. Set `options.on_conflict = "skip"` to make restarts idempotent for targets with a unique key (Postgres `ON CONFLICT DO NOTHING` / MySQL `INSERT IGNORE` / SQLite `INSERT OR IGNORE`).
* **Mongo→SQL requires explicit `selected_columns`** per collection (schemaless docs can't be safely inferred from a sample). `_id` is coerced to a scalar; nested objects/arrays are JSON-encoded into the target column.

## Project layout

```
app/
  config.py            settings (pydantic-settings)
  database.py          async (FastAPI) + sync (Celery) engines
  core/                security (JWT/bcrypt), crypto (Fernet), deps (RBAC), exceptions
  models/              SQLAlchemy models + enums
  schemas/             Pydantic request/response models
  services/            business logic (auth, users, connections, discovery, yaml, migrations)
  routers/             thin HTTP controllers + SSE
  worker/              Celery app + the migration task
alembic/               migrations
scripts/               bootstrap_db.sql, generate_keys.py
```
