# ProjectOps

Enterprise monitoring/ops platform. Node/Express/TypeScript backend with hand-written
parameterized SQL (no ORM), PostgreSQL; React 19/Vite/MUI v9/React Query frontend.

## Stack & layout

- Backend: `src/` — `tsx watch src/index.ts` (dev), `tsc` (build), Express 5, `pg`, Zod v4,
  `ws` for realtime, JWT auth, Firebase admin, Stripe.
  - `src/db/*.repository.ts` — parameterized SQL, one repository file per domain.
  - `src/core/*.ts` — business logic / composition, zero HTTP or raw-SQL leakage.
  - `src/routes/*.routes.ts` — thin Express routers, delegate to `core/`.
  - `src/types/*.types.ts` — shared backend types, mirrored under `frontend/src/types/`.
  - `src/realtime/events.ts` — `RealtimeEventType` enum + discriminated union + `createEvent()`.
  - `db/migrations/NNNN_*.sql` + `db/migrations/down/` — sequential, applied via
    `npm run db:migrate`.
- Frontend: `frontend/src/` — Vite, MUI v9, React Query, `react-router-dom` v7.
  - `frontend/src/api/*.api.ts` → `frontend/src/hooks/use*.ts` → page/component.
  - `frontend/src/hooks/queryKeys.ts` — central query-key factory.
  - `frontend/src/hooks/useRealtime.ts` — central realtime cache-invalidation switchboard.
  - Build: `tsc -b && vite build`; lint: `oxlint`.

## Conventions (load-bearing, established across many phases)

- **BIGSERIAL/BIGINT → string bug**: `pg` returns these as JS strings. Every `mapRow()` must
  `Number()`-wrap them explicitly. If BOTH sides of a Map/lookup are left as unconverted
  strings the bug is silent (self-consistent) — check all consumers together when fixing one.
- **RBAC pattern** (`src/middleware/authorize.ts`): GET endpoints use `authenticate` +
  `authorizePlatformOrOrganizationMembership(resolveOrgIdFromX)`; mutations use
  `authorizePlatformOrOrganizationRole(MANAGE_ROLES, resolveOrgIdFromBody)`. Each entity gets
  a `resolveOrgIdForX(req)` resolver.
- **Tenant isolation for relations**: cross-org references return 404, not 403 (avoid leaking
  existence). Resolve an entity's org via its real FK chain, not client-supplied context.
  Never trust a client-supplied `projectId`/`organizationId` without intersecting it against
  the caller's actual memberships server-side.
- **`test@test.de` is PLATFORM_OWNER** with a global bypass — real 403 authorization tests
  aren't achievable live with this account; only data-level tenant-scoping/leak tests are
  meaningful with it.
- **Login rate-limit workaround**: heavy automated testing trips `express-rate-limit`'s
  in-memory counter. `touch src/index.ts` forces `tsx watch` to restart and clears it. Not an
  application bug.
- **Audit category registration**: a new `AuditCategory` value must be added, in the SAME
  migration/commit, to: the TS union type (backend + frontend), the DB
  `audit_log_category_check` constraint, and any UI filter dropdowns / query-validation
  schemas. Missing one of these is a recurring real bug pattern (documented in migration
  `0043`'s comments; re-hit in Phase 22).
- **Realtime events**: prefer extending an EXISTING event's invalidation (add a query-key
  prefix to `useRealtime.ts`) over adding a new `RealtimeEventType`. Only add a new event when
  no existing mutation event covers it. A new event must be added in 3 places on each side
  (backend enum + discriminated union + `createEvent` overload; frontend string union +
  `REALTIME_EVENT_TYPES` array + discriminated union).
- **Query-key prefix invalidation**: each domain owns a shared array prefix (e.g.
  `["reliability"]`, `["problems"]`); a single `invalidateQueries({queryKey:[prefix]})` catches
  all nested keys. Define one `invalidateXQueries()` helper per domain inside
  `useRealtime.ts`'s effect, call it from every relevant event case.
- **Derive, don't store**: no redundant/duplicated status fields when they can be computed
  live from existing data (e.g. Service Health is never persisted — always derived from
  checks/incidents; SLO/Problem status transitions derive `resolvedAt` rather than storing it
  separately).
- **Deterministic, non-AI thresholds**: any "effectiveness"/"risk"/"status" classification
  must use documented, justified numeric thresholds in code comments — never subjective/LLM
  scoring. When signals conflict (e.g. one metric improved, another regressed), resolve to the
  more cautious/neutral status (e.g. INCONCLUSIVE), checked before the pure-improved/regressed
  branches.
- **`.strict()` Zod schemas** everywhere, to block mass assignment.
- **MUI v9 gotchas**: `CardHeader` title styling is `slotProps={{title:{variant:"h6"}}}`, NOT
  `titleTypographyProps` (removed).
- **Historical/backdated test data**: no API allows setting arbitrary historical timestamps.
  Use temporary `__x_*.ts` tsx scripts (`import "dotenv/config"; import { pool } from
  "./src/db/pool";`) run from the project root for direct SQL fixture insert/update, always
  fully cleaned up via cascading DELETEs and always deleted as files afterward.
- **Change execution timestamp**: only `actualEndAt ?? actualStartAt` counts as a reliable
  execution time; never fall back to `plannedStartAt`/`createdAt` (that would be guessing).
  Also note: `changes` table CHECK constraint `actual_end_at > actual_start_at` is strict.
- **Playwright for browser tests**: vendored in the scratchpad, symlinked into
  `node_modules/playwright(-core)` before a test session and removed after. MUI `Select` needs
  `.MuiPopover-root li, .MuiMenu-list li` locators. Prefer `getByRole("cell"/"heading",
  {name, exact:true})` or `.filter({has: page.getByRole(...)})` over `.filter({hasText})` or
  bare `getByText()`, which are prone to ambiguous substring matches.

## Workflow this project is built with (phase-based development)

Work arrives as large, explicitly numbered "Phase N" specs (German), each defining a
self-contained enterprise feature area. Standing rules across phases:

1. **Bestandsanalyse first.** Before writing any code, grep/read broadly for whether the
   requested capability (or something close to it) already exists. Phase specs usually name
   exactly which prior phases to check.
2. **Do not duplicate.** If a phase turns out to be ~fully covered by existing code (e.g.
   Phase 34 was ~95% already built in Phase 22), STOP, present findings via `AskUserQuestion`,
   and only build the confirmed genuine gaps.
3. **Reuse, compose, don't re-engine.** Later phases are expected to call into earlier phases'
   `core/*.ts` functions directly (e.g. Phase 33 reliability, Phase 34 SLO/error-budget,
   Phase 35 problems, Phase 36 remediation effectiveness, Phase 25's `core/topology.ts` for
   dependency/blast-radius/SPOF) rather than rebuilding equivalent logic. A new DB migration is
   only added when existing tables genuinely can't express the new data.
4. **Testing bar per phase**: a large number of live backend assertions (typically 70-120+)
   covering CRUD, security/tenant-isolation, and edge cases; live browser assertions (30+)
   with Playwright; race-safety assertions only for new mutating endpoints; full cleanup of any
   synthetic test data with a verified before/after baseline.
5. **Deliverable**: a numbered "Abschlussbericht" (30+ points) at the end of each phase,
   closing with a line confirming the test account login was verified
   (`test@test.de` unless documented otherwise).

## Where to look first for a given domain

- Health/Monitoring: `src/core/service-health.ts`, `src/db/dashboard.repository.ts`
- Topology/Dependencies/Blast Radius/SPOF: `src/core/topology.ts` (Phase 25) — mature, cached
  (15s TTL, `invalidateImpactAnalysisCache()`), do not reimplement.
- Reliability/Incident analytics: `src/core/reliability-intelligence.ts` (Phase 33)
- SLO/Error Budget: `src/core/slo-calculator.ts`, `src/core/error-budget.ts` (Phase 22/34)
- Problem Management: `src/core/problem-management.ts` (Phase 35)
- Remediation Effectiveness: `src/core/remediation-effectiveness.ts` (Phase 36)
- Change Risk: `core/` module from Phase 29 (`analyzeChangeRisk()`) — call once per entity, never
  in a per-service/dependency loop.
- Service catalog types: `src/types/service.types.ts` (`Service`, `ServiceDependency`,
  `ServiceHealth`, criticality/environment/lifecycle enums) — spiegelt migration `0044`.
