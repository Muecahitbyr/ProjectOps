import { Router } from "express";
import { z } from "zod";
import {
  createSloIfUnderQuota,
  deleteSlo,
  getSloById,
  getSloHistory,
  getSloOrganizationId,
  getLatestSloEvaluationsForIds,
  listSlos,
  updateSlo,
} from "../db/slo.repository";
import { getOrganizationById } from "../db/organizations.repository";
import { getPlanLimits } from "../config/plan-limits";
import { getSloCurrentStatus } from "../core/slo-calculator";
import { computeErrorBudget } from "../core/error-budget";
import { SLI_TYPES, SLO_HISTORY_WINDOW_HOURS } from "../types/slo.types";
import type { Slo, SloWithCurrentStatus, SliType } from "../types/slo.types";
import { authenticate } from "../middleware/authenticate";
import { authorizePlatformOrOrganizationMembership, authorizePlatformOrOrganizationRole } from "../middleware/authorize";
import { AppError, notFoundError } from "../core/app-error";
import { recordAuditLog } from "../core/audit-log";
import type { OrganizationRoleId } from "../types/organization.types";
import type { Request } from "express";

// Phase 22 "Enterprise Reliability, SLOs, SLA Monitoring & Service Health"
// Auftragspunkt 12 "API Endpoints" (intern) - bestehendes Platform-RBAC
// (authorizePlatformOwner, siehe routes/platform.routes.ts) statt eines
// neuen Rollenkonzepts. Volle CRUD unter demselben Pfad-Praefix wie im
// Auftrag fuer die GET-Endpunkte vorgegeben (POST/PATCH/DELETE fuer die
// laut Auftragspunkt 24 geforderte "SLO erstellen/bearbeiten/loeschen"-UI
// implizit mit REST-Konvention).
//
// Phase 24 Sicherheits-Fix: die bisherige, ausschliessliche Pruefung ueber
// authorizePlatformOwner() liess ueber dessen isGlobalAdmin()-Fallback JEDEN
// Nutzer mit OWNER/ADMIN-Rolle auf irgendeinem (auch organisationsfremden)
// Projekt auf SLOs JEDER Organisation zugreifen/diese aendern - live
// bestaetigter Cross-Tenant-Bug, siehe middleware/authorize.ts und
// Phase-24-Abschlussbericht. Ersetzt durch authorizePlatformOr
// Organization{Membership,Role}(), die bei einer KONKRETEN organizationId
// echte Mitgliedschaft in GENAU dieser Organisation verlangt.
export const platformSloRouter = Router();

const MANAGE_ROLES: OrganizationRoleId[] = ["PLATFORM_OWNER", "ORGANIZATION_OWNER", "ORGANIZATION_ADMIN", "OPERATOR", "DEVELOPER"];

async function resolveOrgIdFromQuery(req: Request): Promise<string | undefined> {
  return typeof req.query.organizationId === "string" ? req.query.organizationId : undefined;
}

async function resolveOrgIdFromBody(req: Request): Promise<string | undefined> {
  return typeof req.body?.organizationId === "string" ? req.body.organizationId : undefined;
}

async function resolveOrgIdForSlo(req: Request): Promise<string | null> {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return null;
  return (await getSloOrganizationId(id)) ?? null;
}

// computeErrorBudget() ist eine reine, DB-lose Funktion (core/error-budget.ts)
// - aus dem gespeicherten Snapshot (sli_value) plus der AKTUELLEN slo.target
// laesst sich die volle Aufschluesselung ohne weitere Abfrage neu ableiten,
// keine redundante Speicherung aller Einzelwerte in slo_evaluations noetig.
async function attachCurrentStatus(slos: Slo[]): Promise<SloWithCurrentStatus[]> {
  const evaluations = await getLatestSloEvaluationsForIds(slos.map((s) => s.id));
  return slos.map((slo) => {
    const evaluation = evaluations.get(slo.id);
    return {
      ...slo,
      current: evaluation
        ? {
            sliValue: evaluation.sliValue,
            errorBudget: computeErrorBudget(slo.sliType, slo.target, evaluation.sliValue, slo.windowDays),
            evaluatedAt: evaluation.evaluatedAt,
          }
        : null,
    };
  });
}

const listQuerySchema = z.object({
  organizationId: z.string().trim().min(1).optional(),
  teamId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
  enabled: z.enum(["true", "false"]).optional(),
});

platformSloRouter.get("/platform/slo", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdFromQuery), async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Filter", details: parsed.error.flatten() });
    return;
  }
  const slos = await listSlos({
    ...(parsed.data.organizationId ? { organizationId: parsed.data.organizationId } : {}),
    ...(parsed.data.teamId ? { teamId: parsed.data.teamId } : {}),
    ...(parsed.data.projectId ? { projectId: parsed.data.projectId } : {}),
    ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled === "true" } : {}),
  });
  res.json(await attachCurrentStatus(slos));
});

platformSloRouter.get("/platform/slo/:id", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdForSlo), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige SLO-ID" });
    return;
  }
  const slo = await getSloById(id);
  if (!slo) {
    throw notFoundError("SLO nicht gefunden");
  }
  const [withStatus] = await attachCurrentStatus([slo]);
  res.json(withStatus);
});

platformSloRouter.get("/platform/slo/:id/status", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdForSlo), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige SLO-ID" });
    return;
  }
  const slo = await getSloById(id);
  if (!slo) {
    throw notFoundError("SLO nicht gefunden");
  }
  res.json(await getSloCurrentStatus(slo));
});

const historyQuerySchema = z.object({
  window: z.enum(["1h", "24h", "7d", "30d"]).catch("24h"),
});

platformSloRouter.get("/platform/slo/:id/history", authenticate, authorizePlatformOrOrganizationMembership(resolveOrgIdForSlo), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige SLO-ID" });
    return;
  }
  const slo = await getSloById(id);
  if (!slo) {
    throw notFoundError("SLO nicht gefunden");
  }
  const { window } = historyQuerySchema.parse(req.query);
  const hours = SLO_HISTORY_WINDOW_HOURS[window];
  const to = new Date();
  const from = new Date(to.getTime() - hours * 60 * 60 * 1000);
  res.json(await getSloHistory(id, from, to));
});

const createSloSchema = z
  .object({
    organizationId: z.string().trim().min(1),
    teamId: z.string().trim().min(1).optional(),
    projectId: z.string().trim().min(1).optional(),
    checkId: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).optional(),
    sliType: z.enum(SLI_TYPES as [SliType, ...SliType[]]),
    target: z.number().gt(0).lte(100),
    latencyThresholdMs: z.number().int().positive().optional(),
    windowDays: z.number().int().positive().max(400).optional(),
    enabled: z.boolean().optional(),
  })
  .strict()
  .refine((data) => data.sliType !== "LATENCY" || data.latencyThresholdMs !== undefined, {
    message: "latencyThresholdMs ist fuer sliType=LATENCY erforderlich",
  })
  .refine((data) => !data.checkId || data.projectId !== undefined, {
    message: "checkId erfordert projectId",
  })
  .refine((data) => !(["API_AVAILABILITY", "API_ERROR_RATE"] as SliType[]).includes(data.sliType) || data.checkId === undefined, {
    message: "checkId ist fuer API_AVAILABILITY/API_ERROR_RATE nicht zulaessig",
  })
  .refine((data) => (["AVAILABILITY", "ERROR_RATE", "LATENCY"] as SliType[]).includes(data.sliType) ? data.projectId !== undefined : true, {
    message: "projectId ist fuer diesen sliType erforderlich",
  });

platformSloRouter.post("/platform/slo", authenticate, authorizePlatformOrOrganizationRole(MANAGE_ROLES, resolveOrgIdFromBody), async (req, res) => {
  const parsed = createSloSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  const organization = await getOrganizationById(parsed.data.organizationId);
  if (!organization) {
    res.status(404).json({ error: "Organisation nicht gefunden" });
    return;
  }
  const limits = getPlanLimits(organization.plan);

  const { organizationId, teamId, projectId, checkId, name, description, sliType, target, latencyThresholdMs, windowDays, enabled } = parsed.data;
  const slo = await createSloIfUnderQuota(
    {
      organizationId,
      ...(teamId !== undefined ? { teamId } : {}),
      ...(projectId !== undefined ? { projectId } : {}),
      ...(checkId !== undefined ? { checkId } : {}),
      name,
      ...(description !== undefined ? { description } : {}),
      sliType,
      target,
      ...(latencyThresholdMs !== undefined ? { latencyThresholdMs } : {}),
      ...(windowDays !== undefined ? { windowDays } : {}),
      ...(enabled !== undefined ? { enabled } : {}),
      ...(req.userId ? { createdBy: req.userId } : {}),
    },
    limits.sloPerOrganization,
  );
  if (!slo) {
    throw new AppError(409, "CONFLICT", `Plan-Limit erreicht: maximal ${limits.sloPerOrganization} SLOs fuer den Plan ${organization.plan}`);
  }
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "SLO_CREATED",
    category: "SLO",
    ...(slo.projectId ? { projectId: slo.projectId } : {}),
    message: `SLO "${slo.name}" erstellt`,
    metadata: { sloId: slo.id, organizationId: slo.organizationId },
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.status(201).json(slo);
});

const updateSloSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    target: z.number().gt(0).lte(100).optional(),
    latencyThresholdMs: z.number().int().positive().nullable().optional(),
    windowDays: z.number().int().positive().max(400).optional(),
    teamId: z.string().trim().min(1).nullable().optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

platformSloRouter.patch("/platform/slo/:id", authenticate, authorizePlatformOrOrganizationRole(MANAGE_ROLES, resolveOrgIdForSlo), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige SLO-ID" });
    return;
  }
  const parsed = updateSloSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  const existing = await getSloById(id);
  if (!existing) {
    throw notFoundError("SLO nicht gefunden");
  }
  const { name, description, target, latencyThresholdMs, windowDays, teamId, enabled } = parsed.data;
  const updated = await updateSlo(id, {
    ...(name !== undefined ? { name } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(target !== undefined ? { target } : {}),
    ...(latencyThresholdMs !== undefined ? { latencyThresholdMs } : {}),
    ...(windowDays !== undefined ? { windowDays } : {}),
    ...(teamId !== undefined ? { teamId } : {}),
    ...(enabled !== undefined ? { enabled } : {}),
  });
  if (!updated) {
    throw notFoundError("SLO nicht gefunden");
  }
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "SLO_UPDATED",
    category: "SLO",
    ...(updated.projectId ? { projectId: updated.projectId } : {}),
    message: `SLO "${updated.name}" aktualisiert`,
    metadata: { sloId: updated.id, organizationId: updated.organizationId },
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.json(updated);
});

platformSloRouter.delete("/platform/slo/:id", authenticate, authorizePlatformOrOrganizationRole(MANAGE_ROLES, resolveOrgIdForSlo), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige SLO-ID" });
    return;
  }
  const existing = await getSloById(id);
  if (!existing) {
    throw notFoundError("SLO nicht gefunden");
  }
  await deleteSlo(id);
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "SLO_DELETED",
    category: "SLO",
    ...(existing.projectId ? { projectId: existing.projectId } : {}),
    message: `SLO "${existing.name}" geloescht`,
    metadata: { sloId: existing.id, organizationId: existing.organizationId },
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.status(204).end();
});

