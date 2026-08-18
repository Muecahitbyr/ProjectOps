# ProjectOps

Monitoring platform for a set of production projects (mobile apps, websites, Firebase/Stripe-backed
services): scheduled health checks, incident detection with AI root-cause analysis, alerting
(threshold/trend/anomaly/composite rules with escalation chains), maintenance windows, analytics,
self-healing automation (safe actions only) and diagnostic snapshots — behind a real authentication
and role-based authorization system.

## Architecture

```
                       ┌─────────────────────┐
   Browser  ───────────▶   reverse-proxy      │  nginx, routes / , /api , /ws
                       │   (production only)  │
                       └─────────┬────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 │                                │
        ┌────────▼────────┐              ┌────────▼────────┐
        │    frontend      │              │     backend      │
        │  React + Vite    │   REST/WS    │  Express + ws    │
        │  MUI + React     │◀────────────▶│  TypeScript      │
        │  Query           │              │                  │
        └──────────────────┘              └────────┬─────────┘
                                                     │
                                            ┌────────▼─────────┐
                                            │    PostgreSQL     │
                                            └────────────────────┘
```

- **Backend** (`src/`): Express 5 REST API + `ws` WebSocket server, a scheduler that runs health
  checks on an interval, an AI incident analyzer (Anthropic Claude), rule-based alerting/incident
  correlation, a notification dispatcher (email/push/in-app/websocket), and a safe-actions
  automation engine.
- **Frontend** (`frontend/`): React 19 + Vite + MUI + React Query. Talks to the backend exclusively
  through `src/api/*.api.ts` modules and a single WebSocket connection (`src/realtime/`).
- **Database**: PostgreSQL, schema managed by hand-written, numbered SQL migrations under
  `db/migrations` (reversible counterparts under `db/migrations/down`).
- **Auth**: JWT access tokens (15 min, httpOnly cookie) + opaque, server-tracked refresh tokens
  (7 days, httpOnly cookie, rotated on refresh, revocable) — see [Authentication](#authentication).

## Prerequisites

- Node.js 22+
- Docker (for PostgreSQL in development, and for the full production stack)
- An Anthropic API key (optional — AI incident analysis degrades gracefully without one)

## Development setup

```bash
# 1. Start PostgreSQL (dev-only compose file, database only)
docker compose up -d

# 2. Backend
cp .env.example .env        # fill in secrets you have (SMTP, Anthropic, Firebase, Stripe...)
npm install
npm run db:migrate
npm run dev                 # http://localhost:4000

# 3. Frontend (separate terminal)
cd frontend
cp .env.example .env        # VITE_API_URL=http://localhost:4000
npm install
npm run dev                 # http://localhost:5173
```

Open `http://localhost:5173`, click **Create account** and register with any name/email/password
(min. 8 characters). If the email matches a user that was seeded without a password, registration
*claims* that existing account (and its project memberships) instead of creating a duplicate.

### Useful scripts

| Location | Command | Purpose |
|---|---|---|
| root | `npm run dev` | Backend with hot reload (`tsx watch`) |
| root | `npm run build` | Compile backend to `dist/` (`tsc`) |
| root | `npm run start` | Run the compiled backend (`node dist/index.js`) |
| root | `npm run db:migrate` | Apply pending SQL migrations (idempotent, tracked in `schema_migrations`) |
| frontend | `npm run dev` | Vite dev server |
| frontend | `npm run build` | Type-check (`tsc -b`) + production build |
| frontend | `npm run lint` | Oxlint |

## Environment variables

Two templates are provided:

- **`.env.example`** — development. Copy to `.env`. `JWT_ACCESS_SECRET` is optional here (an
  ephemeral secret is generated and logged if missing — fine locally, sessions just don't survive
  a restart).
- **`.env.production.example`** — production, used by `docker-compose.production.yml`. Copy to
  `.env.production`. `POSTGRES_PASSWORD`, `JWT_ACCESS_SECRET` and `CORS_ORIGIN` are required; the
  backend refuses to start in production without a strong `JWT_ACCESS_SECRET` (≥ 32 characters).

No secrets are committed anywhere in the codebase — every credential (SMTP, Anthropic, Firebase
service accounts, Stripe, JWT secret, DB password) is read exclusively from the environment. See
the comments in both `.env*.example` files for what each variable does and how to generate it.

## Authentication & authorization

- `POST /api/auth/register` — register, or *claim* a pre-existing passwordless user with the same
  email (used to onboard users that were seeded before real auth existed).
- `POST /api/auth/login` / `POST /api/auth/logout` / `POST /api/auth/refresh` / `GET /api/auth/me`.
- Access tokens are short-lived JWTs; refresh tokens are random, server-tracked (`auth_sessions`
  table, SHA-256 hash stored, rotated on every refresh) — this allows genuine revocation, unlike a
  stateless-only JWT scheme. Both are delivered as httpOnly cookies (`secure` in production).
- Roles are **per project** (`project_members.role_id`: `OWNER` / `ADMIN` / `DEVELOPER` /
  `VIEWER`), reused unchanged from earlier phases. There is no separate global-role column — a user
  who is `OWNER`/`ADMIN` on *any* project is treated as a global administrator for project-less
  actions (e.g. inviting new users).
- Middleware: `authenticate` (verifies the cookie), `authorizeRole([...roles], resolveProjectId)`,
  `authorizeProjectAccess(resolveProjectId)`, `authorizeGlobalAdmin()` — see `src/middleware/`.
- The WebSocket server verifies identity from the same access-token cookie during the upgrade
  handshake; a client can no longer claim to be an arbitrary user.
- The frontend hides management buttons (create alert rule, add maintenance window, manage
  project members, approve/reject automation actions, create users) when the signed-in user lacks
  the required role — this is a UX convenience, **not** the security boundary; every mutating route
  is enforced server-side regardless of what the UI shows.

## Production deployment

```bash
cp .env.production.example .env.production   # fill in (see comments in the file)
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
```

> `--env-file .env.production` is required, not optional — without it, Compose resolves the
> `${VAR}` placeholders in `docker-compose.production.yml` (e.g. `POSTGRES_PASSWORD`) from a plain
> `.env` in the project root if one happens to exist (your local dev config!) instead of
> `.env.production`. `env_file:` on the `backend` service only injects container environment
> variables — it does not affect this substitution step, so both are needed together.

This starts four services on an isolated Docker network:

| Service | Image | Exposed to host |
|---|---|---|
| `postgres` | `postgres:16-alpine` | no |
| `backend` | built from `Dockerfile` (multi-stage, runs migrations then `node dist/index.js`) | no |
| `frontend` | built from `frontend/Dockerfile` (Vite build served by a minimal nginx) | no |
| `reverse-proxy` | `nginx:1.27-alpine`, config at `deploy/nginx/reverse-proxy.conf` | **yes**, `HTTP_PORT` (default 80) |

The reverse proxy is the only service reachable from outside the Docker network. It routes:

- `/` → `frontend` (the static SPA build)
- `/api/*` and `/health` → `backend`
- `/ws` → `backend`, with `Upgrade`/`Connection` headers set for the WebSocket handshake

Because frontend and backend are served from the same origin through the proxy, the frontend uses
relative `/api` paths (`VITE_API_URL` left empty) and cookies work without cross-site exceptions.

**HTTPS**: the reverse-proxy config ships HTTP-ready and includes a commented-out `443 ssl` server
block. To go live with TLS: obtain certificates (e.g. via certbot), mount them at
`./deploy/nginx/certs`, uncomment the HTTPS block and the `HTTPS_PORT` mapping in
`docker-compose.production.yml`, and reduce the `listen 80` block to a redirect to HTTPS.

Backend and frontend both expose Docker `HEALTHCHECK`s against `GET /health` (backend) and `GET /`
(frontend nginx).

## Database

Migrations live in `db/migrations/NNNN_description.sql`, applied in filename order and tracked in
a `schema_migrations` table (`npm run db:migrate` — safe to run repeatedly, only unapplied files
run). Every migration has a reversible counterpart in `db/migrations/down/NNNN_description.down.sql`
for manual rollback (`psql $DATABASE_URL -f db/migrations/down/....down.sql`).

## Project structure

```
src/                      Backend (Express + TypeScript)
  auth/                    password hashing, JWT/refresh-token helpers
  middleware/              authenticate, authorizeRole/authorizeProjectAccess/authorizeGlobalAdmin,
                           request-context, centralized error handler
  routes/                  one file per resource, all behind the auth middleware above
  db/                      one repository per table/resource (parameterized SQL, no ORM)
  core/                    monitor/scheduler, structured logger, AppError, request context
  alerts/                  rule evaluation (threshold/trend/anomaly/composite) + escalation
  incidents/               AI analysis context, correlation, diagnostic snapshots
  automation/              safe-action runner (health check / diagnostic snapshot / collect logs)
  notifications/           channel-agnostic NotificationEvent dispatch (email/push/in-app/websocket)
  realtime/                WebSocket server + event types
db/migrations/             SQL schema history (+ down/ for rollback)
frontend/src/
  auth/                    AuthContext, ProtectedRoute
  api/                     one module per resource, the only place allowed to call axios
  hooks/                   React Query hooks wrapping api/
  pages/, components/      route-level pages (lazy-loaded) and shared UI
  realtime/                WebSocket client (auto-reconnect, heartbeat)
deploy/nginx/               production reverse-proxy config
Dockerfile, frontend/Dockerfile, docker-compose.production.yml
```
