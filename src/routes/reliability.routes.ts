import { Router } from "express";
import { z } from "zod";
import type { Request } from "express";
import {
  buildReliabilityInsights,
  buildReliabilityOverview,
  buildReliabilityProjects,
  buildReliabilityTrends,
  buildRecurringIncidents,
} from "../core/reliability-intelligence";
import { authenticate } from "../middleware/authenticate";
import { authorizePlatformOrOrganizationMembership } from "../middleware/authorize";
import type { ReliabilityFilter } from "../core/reliability-intelligence";

// Phase 33 "Enterprise Reliability Intelligence & Incident Learning" - reine
// Lese-Aggregation (Auftragspunkt 13/19), daher bewusst ein eigener,
// schlanker Router statt Anhaengen an incidents.routes.ts: dort sind
// /incidents/:id/command|communications|recovery-actions bewusst NUR
// inzident-/legacy-scope (nur authenticate(), kein Organisations-Filter -
// siehe dortige Kommentare), waehrend Reliability Intelligence von Anfang
// an organisationsweit aggregiert und daher dasselbe RBAC-Muster wie
// changes.routes.ts/escalation-policies.routes.ts/on-call.routes.ts
// braucht: authorizePlatformOrOrganizationMembership(resolveOrgIdFromQuery).
export const reliabilityRouter = Router();

const RANGE_VALUES = ["24h", "7d", "30d", "90d"] as const;
const RANGE_HOURS: Record<(typeof RANGE_VALUES)[number], number> = {
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
  "90d": 24 * 90,
};
const SEVERITY_VALUES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

async function resolveOrgIdFromQuery(req: Request): Promise<string | undefined> {
  return typeof req.query.organizationId === "string" ? req.query.organizationId : undefined;
}

const filterQuerySchema = z.object({
  organizationId: z.string().trim().min(1),
  range: z.enum(RANGE_VALUES).catch("7d"),
  projectId: z.string().trim().min(1).optional(),
  severity: z.enum(SEVERITY_VALUES).optional(),
});

// Auftragspunkt 17 "Filter" - min. Zeitraum/Projekt/Severity, ausschliesslich
// serverseitig via Query-Parameter (keine Client-seitige Simulation).
function parseFilter(req: Request): ReliabilityFilter | null {
  const parsed = filterQuerySchema.safeParse(req.query);
  if (!parsed.success) return null;
  const { organizationId, range, projectId, severity } = parsed.data;
  return {
    organizationId,
    hours: RANGE_HOURS[range],
    ...(projectId !== undefined ? { projectId } : {}),
    ...(severity !== undefined ? { severity } : {}),
  };
}

function badRequest(res: import("express").Response): void {
  res.status(400).json({ error: "Ungueltige Filter (organizationId erforderlich, range/projectId/severity optional)" });
}

reliabilityRouter.get("/reliability/overview", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdFromQuery), async (req, res) => {
  const filter = parseFilter(req);
  if (!filter) return badRequest(res);
  res.json(await buildReliabilityOverview(filter));
});

reliabilityRouter.get("/reliability/trends", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdFromQuery), async (req, res) => {
  const filter = parseFilter(req);
  if (!filter) return badRequest(res);
  res.json(await buildReliabilityTrends(filter));
});

reliabilityRouter.get("/reliability/projects", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdFromQuery), async (req, res) => {
  const filter = parseFilter(req);
  if (!filter) return badRequest(res);
  res.json(await buildReliabilityProjects(filter));
});

reliabilityRouter.get("/reliability/recurring-incidents", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdFromQuery), async (req, res) => {
  const filter = parseFilter(req);
  if (!filter) return badRequest(res);
  res.json(await buildRecurringIncidents(filter));
});

reliabilityRouter.get("/reliability/insights", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdFromQuery), async (req, res) => {
  const filter = parseFilter(req);
  if (!filter) return badRequest(res);
  res.json(await buildReliabilityInsights(filter));
});
