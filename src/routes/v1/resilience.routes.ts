import { Router } from "express";
import { z } from "zod";
import { buildResilienceOverview, buildServiceResilienceDetail } from "../../core/service-resilience";
import { buildPriorityQueue } from "../../core/operational-priority";
import { getOutcomeIntelligenceSummary } from "../../core/outcome-intelligence";
import { buildCapacityWatchlist } from "../../core/capacity-intelligence";
import { buildBusinessImpactOverview } from "../../core/business-impact-overview";
import { getForecastAccuracySummary } from "../../core/proactive-risk-alerting";
import { getProjectOrganizationId } from "../../db/projects.repository";
import { listProjectIdsForTeam } from "../../db/teams.repository";
import { authenticateApiKey, apiKeyRateLimiter, enforceApiQuota, requireApiScope, trackApiUsage } from "../../middleware/api-key-auth";
import { notFoundError } from "../../core/app-error";
import { paginatedResponse, parsePagination, toResilienceOverviewRowDto, toServiceResilienceDetailDto, toPriorityQueueDto, toOutcomeIntelligenceSummaryDto, toCapacityWatchlistDto, toBusinessImpactOverviewDto, toForecastAccuracySummaryDto } from "./shared";
import { RESILIENCE_RANGE_HOURS, RESILIENCE_RANGE_VALUES } from "../../types/resilience.types";

// Phase 39 "Enterprise Resilience External API & Webhook Integration"
// Auftragspunkt "API Write Platform" - reine Lese-Endpunkte (Resilience ist
// vollstaendig aus bestehenden Daten abgeleitet, core/service-resilience.ts
// bleibt die EINZIGE Berechnungsstelle, siehe Phase 37/38 - hier nur
// zusaetzlich ueber die API-Key-authentifizierte externe API erreichbar
// gemacht, exakt wie /api/v1/slo (Phase 22) fuer die interne, Session-
// authentifizierte /api/resilience-Route (Phase 37) bereits vorgemacht).
export const v1ResilienceRouter = Router();

const overviewQuerySchema = z.object({
  range: z.enum(RESILIENCE_RANGE_VALUES).catch("7d"),
  // Phase 41 "Resilience Layer Performance & Consistency Hardening" -
  // dasselbe {fresh}-Override wie die interne Route (routes/resilience.routes.ts).
  fresh: z.coerce.boolean().optional(),
});

// Team-gescopte Keys duerfen nur Projekte ihres eigenen Teams sehen - dieselbe
// Einschraenkung wie bei jeder anderen team-faehigen /v1-Ressource. buildResilienceOverview()
// selbst kennt (wie core/service-resilience.ts, Phase 37) keinen teamId-Filter
// (Resilience ist eine Organisations-weite Aggregation) - daher hier auf
// Projekt-Ebene nachtraeglich eingeschraenkt, exakt wie routes/v1/slo.routes.ts's
// createSloSchema den teamId-Scope fuer ein einzelnes Projekt prueft.
async function filterRowsForTeam<T extends { projectId: string }>(rows: T[], teamId: string | null): Promise<T[]> {
  if (!teamId) return rows;
  const teamProjectIds = new Set(await listProjectIdsForTeam(teamId));
  return rows.filter((r) => teamProjectIds.has(r.projectId));
}

async function assertProjectVisibleForTeam(projectId: string, teamId: string | null): Promise<void> {
  if (!teamId) return;
  const teamProjectIds = new Set(await listProjectIdsForTeam(teamId));
  if (!teamProjectIds.has(projectId)) {
    throw notFoundError("Projekt nicht gefunden");
  }
}

v1ResilienceRouter.get(
  "/v1/resilience/overview",
  authenticateApiKey,
  requireApiScope("resilience:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const { range, fresh } = overviewQuerySchema.parse(req.query);
    const pagination = parsePagination(req);

    const overview = await buildResilienceOverview(
      { organizationId: context.organizationId, hours: RESILIENCE_RANGE_HOURS[range] },
      { ...(fresh !== undefined ? { fresh } : {}) },
    );
    const rows = await filterRowsForTeam(overview.rows, context.teamId);
    const page = rows.slice(pagination.offset, pagination.offset + pagination.pageSize);
    res.json(paginatedResponse(page.map(toResilienceOverviewRowDto), pagination, rows.length));
  },
);

const detailQuerySchema = z.object({
  range: z.enum(RESILIENCE_RANGE_VALUES).catch("7d"),
});

// Phase 41 "Resilience Layer Performance & Consistency Hardening" - vorher
// (Phase 39) rief diese Tenant-Pruefung buildResilienceOverview() fuer die
// GESAMTE Organisation ein zweites Mal auf, nur um zu pruefen, ob EIN
// Projekt dazugehoert (im dortigen Kommentar selbst als "genauso teuer wie
// eine direkte Abfrage" gerechtfertigt - real aber teurer, da die volle
// Sechs-Quellen-Aggregation lief). getProjectOrganizationId() ist dieselbe
// leichte Einzeilen-Abfrage, die routes/resilience.routes.ts's
// resolveOrgIdForProject() (interne Route) fuer denselben Zweck bereits nutzt.
async function assertProjectInOrganization(projectId: string, organizationId: string): Promise<void> {
  const projectOrgId = await getProjectOrganizationId(projectId);
  if (!projectOrgId || projectOrgId !== organizationId) {
    throw notFoundError("Projekt nicht gefunden");
  }
}

v1ResilienceRouter.get(
  "/v1/resilience/services/:projectId",
  authenticateApiKey,
  requireApiScope("resilience:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    if (typeof req.params.projectId !== "string") {
      res.status(400).json({ error: "Ungueltige Projekt-ID", code: "VALIDATION_ERROR" });
      return;
    }
    const projectId = req.params.projectId;
    const { range } = detailQuerySchema.parse(req.query);

    await assertProjectInOrganization(projectId, context.organizationId);
    await assertProjectVisibleForTeam(projectId, context.teamId);

    const detail = await buildServiceResilienceDetail(projectId, RESILIENCE_RANGE_HOURS[range]);
    if (!detail) throw notFoundError("Projekt nicht gefunden");

    res.json({ data: toServiceResilienceDetailDto(detail) });
  },
);

v1ResilienceRouter.get(
  "/v1/resilience/services/:projectId/signals",
  authenticateApiKey,
  requireApiScope("resilience:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    if (typeof req.params.projectId !== "string") {
      res.status(400).json({ error: "Ungueltige Projekt-ID", code: "VALIDATION_ERROR" });
      return;
    }
    const projectId = req.params.projectId;
    const { range } = detailQuerySchema.parse(req.query);

    await assertProjectInOrganization(projectId, context.organizationId);
    await assertProjectVisibleForTeam(projectId, context.teamId);

    const detail = await buildServiceResilienceDetail(projectId, RESILIENCE_RANGE_HOURS[range]);
    if (!detail) throw notFoundError("Projekt nicht gefunden");

    res.json({ data: toServiceResilienceDetailDto(detail).signals });
  },
);

// Phase 43 "Enterprise Operational Priority Intelligence".
// Siehe Kommentar in routes/resilience.routes.ts (interne Route) - dieselbe
// nachsichtige limit-Behandlung, kein hartes .max() im Schema.
const priorityQueueQuerySchema = z.object({
  range: z.enum(RESILIENCE_RANGE_VALUES).catch("7d"),
  limit: z.coerce.number().int().optional(),
});

v1ResilienceRouter.get(
  "/v1/resilience/priority-queue",
  authenticateApiKey,
  requireApiScope("resilience:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const { range, limit } = priorityQueueQuerySchema.parse(req.query);

    const queue = await buildPriorityQueue({ organizationId: context.organizationId, hours: RESILIENCE_RANGE_HOURS[range], ...(limit !== undefined ? { limit } : {}) });
    const entries = await filterRowsForTeam(queue.entries, context.teamId);
    res.json({ data: toPriorityQueueDto({ ...queue, entries }) });
  },
);

// Phase 45 "Enterprise Acknowledgment Outcome & Continuous Improvement
// Intelligence" - reine Auswertung bestehender Audit-Fakten (siehe
// core/outcome-intelligence.ts), kein neuer Scope (resilience:read genuegt,
// dieselbe Begruendung wie priority-queue oben).
v1ResilienceRouter.get(
  "/v1/resilience/outcomes",
  authenticateApiKey,
  requireApiScope("resilience:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const { range } = overviewQuerySchema.parse(req.query);
    const restrictToProjectIds = context.teamId ? await listProjectIdsForTeam(context.teamId) : undefined;
    const summary = await getOutcomeIntelligenceSummary(context.organizationId, RESILIENCE_RANGE_HOURS[range], restrictToProjectIds);
    res.json({ data: toOutcomeIntelligenceSummaryDto(summary) });
  },
);

// Phase 46 "Enterprise Capacity Early-Warning & Trend Intelligence" -
// dieselbe nachsichtige limit-Behandlung wie priority-queue oben, kein
// neuer Scope.
const capacityWatchlistQuerySchema = z.object({
  range: z.enum(RESILIENCE_RANGE_VALUES).catch("7d"),
  limit: z.coerce.number().int().optional(),
});

v1ResilienceRouter.get(
  "/v1/resilience/capacity-watchlist",
  authenticateApiKey,
  requireApiScope("resilience:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const { range, limit } = capacityWatchlistQuerySchema.parse(req.query);
    const watchlist = await buildCapacityWatchlist({ organizationId: context.organizationId, hours: RESILIENCE_RANGE_HOURS[range], ...(limit !== undefined ? { limit } : {}) });
    const entries = await filterRowsForTeam(watchlist.entries, context.teamId);
    res.json({ data: toCapacityWatchlistDto({ ...watchlist, entries }) });
  },
);

// Phase 47 "Enterprise Business Impact & Service Criticality Intelligence" -
// dieselbe nachsichtige limit-Behandlung wie priority-queue/capacity-watchlist
// oben, kein neuer Scope. businessOwner bewusst NICHT im DTO (siehe
// toBusinessImpactOverviewDto/shared.ts-Kommentar).
const businessImpactQuerySchema = z.object({
  range: z.enum(RESILIENCE_RANGE_VALUES).catch("7d"),
  limit: z.coerce.number().int().optional(),
});

v1ResilienceRouter.get(
  "/v1/resilience/business-impact",
  authenticateApiKey,
  requireApiScope("resilience:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const { range, limit } = businessImpactQuerySchema.parse(req.query);
    const overview = await buildBusinessImpactOverview({ organizationId: context.organizationId, hours: RESILIENCE_RANGE_HOURS[range], ...(limit !== undefined ? { limit } : {}) });
    const entries = await filterRowsForTeam(overview.entries, context.teamId);
    res.json({ data: toBusinessImpactOverviewDto({ ...overview, entries }) });
  },
);

// Phase 49 "Enterprise Risk Forecasting & Proactive Operations Intelligence" -
// kein neuer Scope, dieselbe Begruendung wie outcomes/business-impact oben.
v1ResilienceRouter.get(
  "/v1/resilience/proactive-risk-accuracy",
  authenticateApiKey,
  requireApiScope("resilience:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const { range } = overviewQuerySchema.parse(req.query);
    const restrictToProjectIds = context.teamId ? await listProjectIdsForTeam(context.teamId) : undefined;
    const summary = await getForecastAccuracySummary(context.organizationId, RESILIENCE_RANGE_HOURS[range], restrictToProjectIds);
    res.json({ data: toForecastAccuracySummaryDto(summary) });
  },
);
