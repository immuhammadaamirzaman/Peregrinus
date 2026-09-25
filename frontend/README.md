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

- The **access token lives only in memory** (see [`src/lib/tokens.ts`](src/lib/tokens.ts)),
  never in `localStorage`, so an XSS cannot exfiltrate a persisted credential. It
  is attached as a `Bearer` header on every request — including the SSE stream,
  which the native `EventSource` API can't authenticate.
- The **refresh token is an httpOnly cookie** set by the backend (scoped to the
  auth path), unreadable by JavaScript. On load the app silently calls
  `POST /auth/refresh` (cookie-backed) to restore the session; a single axios
  interceptor rotates it once on a `401` and replays the request; logout calls
  `POST /auth/logout` to revoke the session server-side.
- `ProtectedRoute` guards authenticated routes (and admin-only routes via
  `roles`). `RoleGate` / `CanWrite` hide mutating controls from `guest` users —
  the backend enforces RBAC regardless; this is just UX.

### Production hardening

The built SPA should be served with security headers from your web server /
reverse proxy (Vite does not emit these for the production build). Recommended:

```
Content-Security-Policy: default-src 'self'; connect-src 'self' <api-origin>; object-src 'none'; base-uri 'self'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

Serve over HTTPS so the `Secure` refresh cookie is sent.

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