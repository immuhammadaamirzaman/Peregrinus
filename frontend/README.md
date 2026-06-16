# DataMovers — Frontend

A React + TypeScript single-page app for the DataMovers control plane: sign in,
manage encrypted database connections, build migration jobs, and watch them run
live. Talks to the FastAPI backend in [`../backend`](../backend).

## Stack

| Concern | Choice |
|---|---|
| Build/dev | Vite 8 |
| UI | React 19 + TypeScript (strict) |
| Routing | React Router 7 (protected + role-gated routes) |
| Server state | TanStack Query 5 |
| HTTP | Axios (Bearer injection + silent token refresh on 401) |
| Live updates | SSE via `@microsoft/fetch-event-source` (Bearer-authenticated) |
| Forms | React Hook Form + Zod |
| Styling | Tailwind CSS v4 (custom components, no heavy UI lib) |
| Toasts | Sonner · Icons: lucide-react |

## Setup

```powershell
cd frontend
npm install
copy .env.example .env   # optional — only if the backend isn't on :8000
npm run dev              # http://localhost:5173
```

The dev server **proxies `/api` and `/health` to the backend** (default
`http://localhost:8000`, override via `VITE_API_PROXY_TARGET` in `.env`), so the
app is origin-relative and there's no CORS setup in development.

Make sure the backend is running (`uvicorn app.main:app --reload`) and that you
have an approved account. The first admin is seeded from the backend's
`FIRST_ADMIN_*` env vars; new self-service sign-ups land in **pending** and must
be approved by an admin under **Users**.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the dev server with HMR |
| `npm run build` | Type-check (`tsc -b`) + production build |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint |

## How it maps to the backend

| Area | Backend endpoints |
|---|---|
| Auth | `POST /auth/login` (OAuth2 form), `/auth/register`, `/auth/refresh`, `GET /auth/me` |
| Connections | CRUD under `/connections` + `POST /test`, `/{id}/test`, `/{id}/tables`, `/{id}/columns` |
| Migrations | CRUD under `/migrations` + `/{id}/start`, `/{id}/cancel`, `/{id}/logs`, `/{id}/stream` (SSE) |
| Users (admin) | `/users` + `PATCH /{id}/role`, `/{id}/status` |

### Auth & route protection

- Access + refresh tokens are stored in `localStorage` (see the rationale in
  [`src/lib/tokens.ts`](src/lib/tokens.ts)). The access token is attached as a
  `Bearer` header on every request — including the SSE stream, which the native
  `EventSource` API can't authenticate.
- A single axios interceptor refreshes the token pair once on a `401` and
  replays the request; if refresh fails it broadcasts a logout.
- `ProtectedRoute` guards authenticated routes (and admin-only routes via
  `roles`). `RoleGate` / `CanWrite` hide mutating controls from `guest` users —
  the backend enforces RBAC regardless; this is just UX.

### Project layout

```
src/
  api/         typed API clients (one per backend router) + SSE stream
  auth/        AuthProvider, useAuth, session hydration
  components/  ui/ primitives (Button, Input, Modal, Table, …) + layout + guards
  constants/   DB engine / SSL / filter metadata + status tones
  hooks/       TanStack Query hooks + the live migration-stream hook
  lib/         axios client, token store, query client, formatters, cn()
  pages/       Login, Register, Dashboard, Connections, Migrations, Admin/Users
  types/       TypeScript mirrors of the backend Pydantic schemas
```

## Phase-1 notes (mirrors the backend)

- Full-dump copy only. Target tables/collections must already exist.
- Engines: PostgreSQL, MySQL, MongoDB, SQLite (SQL Server is reserved).
- Filters are structured `{column, op, value}` rows (no raw SQL).
- Mongo → SQL needs explicit column selection per collection.
