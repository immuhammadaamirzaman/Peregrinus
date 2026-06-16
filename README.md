# DataMovers

A full-stack database migration platform. Move data between PostgreSQL, MySQL, MongoDB, and SQLite through a web UI — with JWT auth, role-based access control, background job execution, and live progress streaming.

## Architecture

```
React (frontend)  →  FastAPI (REST + SSE)  →  Celery (Redis/Memurai)  →  Redpanda Connect
                           │                                                      │
                           └──────────  PostgreSQL (metadata DB)  ←──────────────┘
```

| Layer | Stack |
|---|---|
| Frontend | React 19 + TypeScript + Vite + TanStack Query + Tailwind CSS |
| Backend | Python 3.12 + FastAPI + SQLAlchemy + Alembic + Celery |
| Broker | Redis / Memurai (Windows) |
| Data engine | Redpanda Connect (subprocess, config generated at runtime) |
| Metadata DB | PostgreSQL |

## Monorepo layout

```
datamovers/
├── backend/    # FastAPI control plane — see backend/README.md
└── frontend/   # React SPA — see frontend/README.md
```

## Quick start

**Backend**
```powershell
cd backend
python -m venv .venv && .venv\Scripts\Activate.ps1
pip install -r requirements.txt
# copy .env.example .env and fill in values
uvicorn app.main:app --reload
```

**Frontend**
```powershell
cd frontend
npm install
npm run dev   # http://localhost:5173
```

See each service's README for full setup, prerequisites, and environment variables.
