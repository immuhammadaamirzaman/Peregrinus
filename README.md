# DataMovers

A full-stack database migration platform. Move data between **PostgreSQL, MySQL, MongoDB, and SQLite** through a clean web UI — with role-based access control, encrypted credential storage, background job execution, and live progress streaming.

---

## Features

- **Multi-engine support** — migrate between any combination of PostgreSQL, MySQL, MongoDB, and SQLite
- **Encrypted credentials** — database passwords are Fernet-encrypted at rest; never exposed by the API
- **Background jobs** — migrations run via Celery workers; the UI stays responsive with live SSE log streaming
- **Role-based access** — Admin / User / Guest roles with approval-gated sign-ups
- **Resume-safe** — completed tables are checkpointed; interrupted migrations skip already-copied tables on retry
- **Structured filters** — per-table row filters (`eq`, `ne`, `gt`, `like`, `in`, …) with bound parameters — no SQL injection surface
- **Schema discovery** — browse source tables and columns before building a migration job
- **Conflict handling** — configurable `on_conflict` strategy (`fail` / `skip`) for idempotent restarts

---

## Architecture

```
React SPA (Vite)
      │  REST + SSE
      ▼
FastAPI control plane  ──►  Celery worker (Redis/Memurai)  ──►  Redpanda Connect
      │                                                               (data engine)
      ▼
PostgreSQL  (metadata: users, connections, jobs, logs, checkpoints)
```

| Layer | Stack |
|---|---|
| Frontend | React 19 · TypeScript · Vite · React Router 7 · TanStack Query · Tailwind CSS v4 |
| Backend | Python 3.12 · FastAPI · SQLAlchemy (async) · Alembic · Pydantic v2 |
| Job queue | Celery · Redis / [Memurai](https://www.memurai.com/) (Windows) |
| Data engine | [Redpanda Connect](https://github.com/redpanda-data/connect) — configs generated per-table at runtime |
| Metadata store | PostgreSQL |
| Auth | JWT (HS256) · 15-min access tokens · 7-day refresh tokens · bcrypt passwords |

---

## Monorepo layout

```
datamovers/
├── backend/     FastAPI control plane + Celery worker
└── frontend/    React SPA
```

Each service has its own README with full setup instructions:

- [backend/README.md](backend/README.md)
- [frontend/README.md](frontend/README.md)

---

## Quick start

### Prerequisites

| Tool | Notes |
|---|---|
| Python 3.12 | Required for backend C-extension wheels |
| PostgreSQL | Metadata store |
| Memurai or Redis | Celery broker ([Memurai](https://www.memurai.com/) for Windows) |
| Node.js 20+ | Frontend build |
| [Redpanda Connect binary](https://github.com/redpanda-data/connect/releases) | Place at `backend/bin/rpk-connect.exe` |

### Backend

```powershell
cd backend

# 1. Create virtualenv and install dependencies
py -3.12 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# 2. Create the metadata database
psql -U postgres -f scripts/bootstrap_db.sql

# 3. Configure environment
copy .env.example .env
python scripts/generate_keys.py   # paste output into .env, then fill remaining vars

# 4. Run database migrations
python -m alembic upgrade head

# 5. Start the API server
uvicorn app.main:app --reload

# 6. Start the Celery worker (separate terminal)
celery -A app.worker.celery_app worker --pool=solo --loglevel=info
```

API docs: http://localhost:8000/docs

### Frontend

```powershell
cd frontend
npm install
npm run dev   # http://localhost:5173
```

The dev server proxies `/api` and `/health` to the backend on `http://localhost:8000`.

---

## First login

On first startup, the backend seeds an admin user from `FIRST_ADMIN_EMAIL` and `FIRST_ADMIN_PASSWORD` in `.env`. Use those credentials to log in. **Change the password immediately after.**

New sign-ups via the UI are created as `pending` and require admin approval under the **Users** page before they can log in.

---

## Security notes

- DB credentials are **Fernet-encrypted** in PostgreSQL — the raw password is never stored or returned
- Generated Redpanda Connect configs reference env-var placeholders (`${DM_SOURCE_DSN}`); real DSNs are injected as subprocess environment variables at runtime and the temp config file is deleted immediately after each migration run
- Row filters use **bound parameters** — no raw SQL or NoSQL injection surface
- JWT access tokens expire after 15 minutes; refresh tokens after 7 days

---

## Current limitations (Phase 1)

- Full-dump copy only — no incremental / CDC support yet
- Target tables must already exist — DataMovers inserts data, it does not create schema
- MongoDB → SQL migrations require explicit `selected_columns` per collection (schemaless documents cannot be safely auto-inferred)
- Windows-native setup (Memurai instead of Redis); Linux/macOS support via standard Redis works the same way
