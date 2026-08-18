import { Router } from "express";
import { z } from "zod";
import type { Request } from "express";
import { buildResilienceOverview, buildServiceResilienceDetail } from "../core/service-resilience";
import { buildPriorityQueue, getPriorityItemAcknowledgment, acknowledgePriorityItem } from "../core/operational-priority";
import { getProjectAcknowledgmentOutcomeHistory, getOutcomeIntelligenceSummary } from "../core/outcome-intelligence";
import { buildCapacityWatchlist } from "../core/capacity-intelligence";
import { buildBusinessImpactOverview } from "../core/business-impact-overview";
import { getForecastAccuracySummary } from "../core/proactive-risk-alerting";
import { buildRiskCorrelation } from "../core/risk-correlation";
import { buildOperationalStateOverview } from "../core/operational-state";
import { buildAttentionList } from "../core/attention";
import { buildDecisionContext } from "../core/decision-context";
import { getProjectOrganizationId } from "../db/projects.repository";
import { authenticate } from "../middleware/authenticate";
import { authorizePlatformOrOrganizationMembership, authorizePlatformOrOrganizationRole } from "../middleware/authorize";
import { RESILIENCE_RANGE_HOURS, RESILIENCE_RANGE_VALUES } from "../types/resilience.types";
import type { OrganizationRoleId } from "../types/organization.types";

// Phase 37 "Enterprise Service Resilience & Dependency Intelligence" - reine
// Lese-Aggregation (kein CRUD, siehe core/service-resilience.ts), daher ein
// eigener, schlanker Router nach demselben Muster wie
// routes/reliability.routes.ts (Phase 33) / routes/problems.routes.ts
// (Phase 35): authorizePlatformOrOrganizationMembership() fuer alle
// Lese-Endpunkte. Phase 44 "Enterprise Priority Queue Acknowledgment
// Governance" ergaenzt den ERSTEN schreibenden Endpunkt dieses Routers -
// dieselbe MANAGE_ROLES-Liste wie routes/problems.routes.ts (Phase 35),
// keine neue Rollen-Definition.
export const resilienceRouter = Router();

const MANAGE_ROLES: OrganizationRoleId[] = ["PLATFORM_OWNER", "ORGANIZATION_OWNER", "ORGANIZATION_ADMIN", "OPERATOR", "DEVELOPER"];

async function resolveOrgIdFromQuery(req: Request): Promise<string | undefined> {
  return typeof req.query.organizationId === "string" ? req.query.organizationId : undefined;
}

// Fuer die :projectId-Routen unten: die Organisation wird IMMER aus dem
// bereits gespeicherten Projekt aufgeloest (nicht aus einem Query-Parameter
// uebernommen) - identisch zum etablierten Muster resolveOrgIdForService()
// (routes/platform-services.routes.ts) / resolveOrgIdForProblem()
// (routes/problems.routes.ts): ein fremdes projectId fuehrt zu 404, nicht
// 403 (keine Existenz-Information an Nicht-Mitglieder leaken).
async function resolveOrgIdForProject(req: Request): Promise<string | null> {
  if (typeof req.params.projectId !== "string") return null;
  return (await getProjectOrganizationId(req.params.projectId)) ?? null;
}

const overviewQuerySchema = z.object({
  organizationId: z.string().trim().min(1),
  range: z.enum(RESILIENCE_RANGE_VALUES).catch("7d"),
  projectId: z.string().trim().min(1).optional(),
  // Phase 41 "Resilience Layer Performance & Consistency Hardening" -
  // dasselbe {fresh}-Override-Prinzip wie GET /platform/services/:id/impact
  // (core/topology.ts's 15s-Cache, Phase 25): standardmaessig gecacht
  // (buildResilienceOverview() hat seit dieser Phase ebenfalls einen 15s-
  // TTL-Cache), aber explizit umgehbar fuer Faelle, in denen eine gerade
  // erst durchgefuehrte Aenderung sofort sichtbar sein muss.
  fresh: z.coerce.boolean().optional(),
});

const detailQuerySchema = z.object({
  range: z.enum(RESILIENCE_RANGE_VALUES).catch("7d"),
});

function badRequest(res: import("express").Response): void {
  res.status(400).json({ error: "Ungueltige Filter (organizationId erforderlich, range/projectId optional)" });
}

resilienceRouter.get("/resilience/overview", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdFromQuery), async (req, res) => {
  const parsed = overviewQuerySchema.safeParse(req.query);
  if (!parsed.success) return badRequest(res);
  const { organizationId, range, projectId, fresh } = parsed.data;
  const overview = await buildResilienceOverview(
    { organizationId, hours: RESILIENCE_RANGE_HOURS[range], ...(projectId !== undefined ? { projectId } : {}) },
    { ...(fresh !== undefined ? { fresh } : {}) },
  );
  res.json(overview);
});

resilienceRouter.get("/resilience/services/:projectId", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdForProject), async (req, res) => {
  const parsed = detailQuerySchema.safeParse(req.query);
  if (!parsed.success) return badRequest(res);
  const detail = await buildServiceResilienceDetail(req.params.projectId as string, RESILIENCE_RANGE_HOURS[parsed.data.range]);
  if (!detail) return res.status(404).json({ error: "Projekt nicht gefunden" });
  res.json(detail);
});

resilienceRouter.get(
  "/resilience/services/:projectId/dependencies",
  authenticate,
  authorizePlatformOrOrganizationMembership(resolveOrgIdForProject),
  async (req, res) => {
    const parsed = detailQuerySchema.safeParse(req.query);
    if (!parsed.success) return badRequest(res);
    const detail = await buildServiceResilienceDetail(req.params.projectId as string, RESILIENCE_RANGE_HOURS[parsed.data.range]);
    if (!detail) return res.status(404).json({ error: "Projekt nicht gefunden" });
    res.json(detail.dependencies ?? { serviceId: null, serviceName: null, dependencies: [], dependents: [] });
  },
);

resilienceRouter.get(
  "/resilience/services/:projectId/signals",
  authenticate,
  authorizePlatformOrOrganizationMembership(resolveOrgIdForProject),
  async (req, res) => {
    const parsed = detailQuerySchema.safeParse(req.query);
    if (!parsed.success) return badRequest(res);
    const detail = await buildServiceResilienceDetail(req.params.projectId as string, RESILIENCE_RANGE_HOURS[parsed.data.range]);
    if (!detail) return res.status(404).json({ error: "Projekt nicht gefunden" });
    res.json({ signals: detail.signals });
  },
);

// Phase 50 "Enterprise Operational Decision & Executive Intelligence" - reine
// Korrelations-/Synthese-Route, siehe core/decision-context.ts. Kein
// Schreib-Endpunkt - jede Recommendation verweist nur auf bereits
// bestehende Aktions-Endpunkte, fuehrt selbst nichts aus.
resilienceRouter.get(
  "/resilience/services/:projectId/decision-context",
  authenticate,
  authorizePlatformOrOrganizationMembership(resolveOrgIdForProject),
  async (req, res) => {
    const parsed = detailQuerySchema.safeParse(req.query);
    if (!parsed.success) return badRequest(res);
    const context = await buildDecisionContext(req.params.projectId as string, RESILIENCE_RANGE_HOURS[parsed.data.range]);
    if (!context) return res.status(404).json({ error: "Projekt nicht gefunden" });
    res.json(context);
  },
);

// Phase 43 "Enterprise Operational Priority Intelligence".
// limit ist bewusst nur lose typgeprueft (kein .min()/.max(), das Zod bei
// Ueberschreitung mit 400 ablehnen wuerde) - dieselbe nachsichtige Konvention
// wie parsePagination() (routes/v1/shared.ts): ein zu grosser/kleiner Wert
// wird von buildPriorityQueue() selbst deterministisch auf [1, MAX_LIMIT]
// geklemmt, statt den gesamten Request abzulehnen.
const priorityQueueQuerySchema = z.object({
  organizationId: z.string().trim().min(1),
  range: z.enum(RESILIENCE_RANGE_VALUES).catch("7d"),
  limit: z.coerce.number().int().optional(),
});

resilienceRouter.get("/resilience/priority-queue", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdFromQuery), async (req, res) => {
  const parsed = priorityQueueQuerySchema.safeParse(req.query);
  if (!parsed.success) return badRequest(res);
  const { organizationId, range, limit } = parsed.data;
  const queue = await buildPriorityQueue({ organizationId, hours: RESILIENCE_RANGE_HOURS[range], ...(limit !== undefined ? { limit } : {}) });
  res.json(queue);
});

// Phase 44 "Enterprise Priority Queue Acknowledgment Governance".
resilienceRouter.get(
  "/resilience/services/:projectId/acknowledgment",
  authenticate,
  authorizePlatformOrOrganizationMembership(resolveOrgIdForProject),
  async (req, res) => {
    const acknowledgment = await getPriorityItemAcknowledgment(req.params.projectId as string);
    res.json({ acknowledgment });
  },
);

const acknowledgeBodySchema = z
  .object({
    range: z.enum(RESILIENCE_RANGE_VALUES).catch("7d"),
    note: z.string().trim().max(1000).optional(),
  })
  .strict();

// Auftragspunkt 6/7 "kontrollierte Aktion, serverseitig durchgesetzt" -
// authorizePlatformOrOrganizationRole (nicht nur -Membership wie die
// GET-Endpunkte oben) verlangt eine tatsaechliche Schreibrolle in der
// Organisation dieses Projekts; resolveOrgIdForProject loest die
// Organisation weiterhin ausschliesslich ueber das gespeicherte Projekt
// auf (nie ueber Client-Eingaben) - ein fremdes projectId liefert 404,
// nicht 403 (keine Existenz-Information leaken, dasselbe Prinzip wie bei
// jeder anderen :projectId-Route in diesem Router).
resilienceRouter.post(
  "/resilience/services/:projectId/acknowledge",
  authenticate,
  authorizePlatformOrOrganizationRole(MANAGE_ROLES, resolveOrgIdForProject),
  async (req, res) => {
    const projectId = req.params.projectId as string;
    const organizationId = await getProjectOrganizationId(projectId);
    if (!organizationId) {
      res.status(404).json({ error: "Projekt nicht gefunden" });
      return;
    }
    const parsed = acknowledgeBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
      return;
    }

    const result = await acknowledgePriorityItem({
      organizationId,
      projectId,
      hours: RESILIENCE_RANGE_HOURS[parsed.data.range],
      userId: req.userId!,
      ...(parsed.data.note !== undefined ? { note: parsed.data.note } : {}),
      ...(req.ip ? { ipAddress: req.ip } : {}),
    });

    if (result.outcome === "NOT_APPLICABLE") {
      res.status(409).json({ error: "Projekt ist aktuell nicht in der Priority Queue (HEALTHY/UNKNOWN) - nichts zu bestaetigen" });
      return;
    }
    // ALREADY_ACKNOWLEDGED -> 200 (idempotenter Wiederholungsfall, kein
    // neuer Zustand entstanden); ACKNOWLEDGED -> 201 (neuer Audit-Eintrag).
    res.status(result.outcome === "ACKNOWLEDGED" ? 201 : 200).json({ acknowledgment: result.acknowledgment, alreadyAcknowledged: result.outcome === "ALREADY_ACKNOWLEDGED" });
  },
);

// Phase 45 "Enterprise Acknowledgment Outcome & Continuous Improvement
// Intelligence" - beides reine Lese-/Auswertungsendpunkte, daher dieselbe
// Membership-Autorisierung wie jeder andere GET in diesem Router (kein
// neuer Schreib-Endpunkt, keine neue Rolle).
resilienceRouter.get(
  "/resilience/services/:projectId/acknowledgment-history",
  authenticate,
  authorizePlatformOrOrganizationMembership(resolveOrgIdForProject),
  async (req, res) => {
    const projectId = req.params.projectId as string;
    const organizationId = await getProjectOrganizationId(projectId);
    if (!organizationId) {
      res.status(404).json({ error: "Projekt nicht gefunden" });
      return;
    }
    const parsed = detailQuerySchema.safeParse(req.query);
    if (!parsed.success) return badRequest(res);
    const history = await getProjectAcknowledgmentOutcomeHistory(projectId, organizationId, RESILIENCE_RANGE_HOURS[parsed.data.range]);
    res.json(history);
  },
);

resilienceRouter.get("/resilience/outcomes", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdFromQuery), async (req, res) => {
  const parsed = overviewQuerySchema.safeParse(req.query);
  if (!parsed.success) return badRequest(res);
  const summary = await getOutcomeIntelligenceSummary(parsed.data.organizationId, RESILIENCE_RANGE_HOURS[parsed.data.range]);
  res.json(summary);
});

// Phase 46 "Enterprise Capacity Early-Warning & Trend Intelligence" -
// dieselbe nachsichtige limit-Behandlung wie priority-queue oben (kein
// hartes Zod .max(), core/capacity-intelligence.ts klemmt selbst).
const capacityWatchlistQuerySchema = z.object({
  organizationId: z.string().trim().min(1),
  range: z.enum(RESILIENCE_RANGE_VALUES).catch("7d"),
  limit: z.coerce.number().int().optional(),
});

resilienceRouter.get("/resilience/capacity-watchlist", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdFromQuery), async (req, res) => {
  const parsed = capacityWatchlistQuerySchema.safeParse(req.query);
  if (!parsed.success) return badRequest(res);
  const { organizationId, range, limit } = parsed.data;
  const watchlist = await buildCapacityWatchlist({ organizationId, hours: RESILIENCE_RANGE_HOURS[range], ...(limit !== undefined ? { limit } : {}) });
  res.json(watchlist);
});

// Phase 58 "Enterprise Operational Risk Correlation" - dieselbe nachsichtige
// limit-Behandlung wie priority-queue/capacity-watchlist oben (kein hartes
// Zod .max(), core/risk-correlation.ts klemmt selbst). Reine Lese-
// Aggregation ueber bereits bestehende Signale (Phase 55/56) - kein
// Schreibzugriff, dieselbe Autorisierung wie jede andere org-weite
// Resilience-Uebersicht.
const riskCorrelationQuerySchema = z.object({
  organizationId: z.string().trim().min(1),
  range: z.enum(RESILIENCE_RANGE_VALUES).catch("7d"),
  limit: z.coerce.number().int().optional(),
});

resilienceRouter.get("/resilience/risk-correlation", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdFromQuery), async (req, res) => {
  const parsed = riskCorrelationQuerySchema.safeParse(req.query);
  if (!parsed.success) return badRequest(res);
  const { organizationId, range, limit } = parsed.data;
  const correlation = await buildRiskCorrelation({ organizationId, hours: RESILIENCE_RANGE_HOURS[range], ...(limit !== undefined ? { limit } : {}) });
  res.json(correlation);
});

// Phase 63 "Enterprise Operational Portfolio Intelligence" - reine
// Zusammenfuehrung bereits bestehender, unabhaengig getesteter org-weiter
// Uebersichten (Priority Queue/43, Capacity Watchlist/46/54, Service
// Portfolio/48, Risk Correlation/58, Control Effectiveness/60, Governance
// Rule Conflicts/61, Outcome/Decision Quality/45/62) zu EINEM Gesamtbild -
// kein Schreibzugriff, dieselbe Autorisierung wie jede andere org-weite
// Resilience-Uebersicht.
const operationalStateQuerySchema = z.object({
  organizationId: z.string().trim().min(1),
  range: z.enum(RESILIENCE_RANGE_VALUES).catch("7d"),
});

resilienceRouter.get("/resilience/operational-state", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdFromQuery), async (req, res) => {
  const parsed = operationalStateQuerySchema.safeParse(req.query);
  if (!parsed.success) return badRequest(res);
  const { organizationId, range } = parsed.data;
  const overview = await buildOperationalStateOverview({ organizationId, hours: RESILIENCE_RANGE_HOURS[range] });
  res.json(overview);
});

// Phase 64 "Enterprise Operational Priority & Attention Management" - EINE,
// nach Dringlichkeit sortierte, org-weite Liste einzelner Incidents/
// Problems/Changes/Governance-Konflikte/Service-Risiken ("was braucht JETZT
// Aufmerksamkeit und warum") - reine Zusammenfuehrung bestehender Quellen
// (core/attention.ts), dieselbe Autorisierung wie jede andere org-weite
// Resilience-Uebersicht. ownerId optional (nachsichtig getippt wie limit
// bei priority-queue oben) - "assignedToMe", ohne req.userId
// preiszugeben, wenn nicht gesetzt.
const attentionListQuerySchema = z.object({
  organizationId: z.string().trim().min(1),
  range: z.enum(RESILIENCE_RANGE_VALUES).catch("7d"),
  limit: z.coerce.number().int().optional(),
  assignedToMe: z.coerce.boolean().optional(),
});

resilienceRouter.get("/resilience/attention-list", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdFromQuery), async (req, res) => {
  const parsed = attentionListQuerySchema.safeParse(req.query);
  if (!parsed.success) return badRequest(res);
  const { organizationId, range, limit, assignedToMe } = parsed.data;
  const list = await buildAttentionList({
    organizationId,
    hours: RESILIENCE_RANGE_HOURS[range],
    ...(limit !== undefined ? { limit } : {}),
    ...(assignedToMe && req.userId ? { ownerId: req.userId } : {}),
  });
  res.json(list);
});

// Phase 47 "Enterprise Business Impact & Service Criticality Intelligence" -
// dieselbe nachsichtige limit-Behandlung wie priority-queue/capacity-watchlist
// oben (kein hartes Zod .max(), core/business-impact-overview.ts klemmt
// selbst).
const businessImpactQuerySchema = z.object({
  organizationId: z.string().trim().min(1),
  range: z.enum(RESILIENCE_RANGE_VALUES).catch("7d"),
  limit: z.coerce.number().int().optional(),
});

resilienceRouter.get("/resilience/business-impact", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdFromQuery), async (req, res) => {
  const parsed = businessImpactQuerySchema.safeParse(req.query);
  if (!parsed.success) return badRequest(res);
  const { organizationId, range, limit } = parsed.data;
  const overview = await buildBusinessImpactOverview({ organizationId, hours: RESILIENCE_RANGE_HOURS[range], ...(limit !== undefined ? { limit } : {}) });
  res.json(overview);
});

// Phase 49 "Enterprise Risk Forecasting & Proactive Operations Intelligence".
resilienceRouter.get("/resilience/proactive-risk-accuracy", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdFromQuery), async (req, res) => {
  const parsed = overviewQuerySchema.safeParse(req.query);
  if (!parsed.success) return badRequest(res);
  const summary = await getForecastAccuracySummary(parsed.data.organizationId, RESILIENCE_RANGE_HOURS[parsed.data.range]);
  res.json(summary);
});
