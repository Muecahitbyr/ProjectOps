import { Router } from "express";
import type { Request } from "express";
import { z } from "zod";
import {
  createSloIfUnderQuota,
  deleteSlo,
  getSloById,
  getSloHistory,
  getLatestSloEvaluationsForIds,
  listSlos,
  updateSlo,
} from "../../db/slo.repository";
import { getProjectOrganizationId } from "../../db/projects.repository";
import { listProjectIdsForTeam } from "../../db/teams.repository";
import { getOrganizationById } from "../../db/organizations.repository";
import { getPlanLimits } from "../../config/plan-limits";
import { getSloCurrentStatus } from "../../core/slo-calculator";
import { computeErrorBudget } from "../../core/error-budget";
import { SLI_TYPES, SLO_HISTORY_WINDOW_HOURS } from "../../types/slo.types";
import type { Slo, SliType } from "../../types/slo.types";
import {
  authenticateApiKey,
  apiKeyRateLimiter,
  apiKeyWriteRateLimiter,
  enforceApiQuota,
  requireApiScope,
  trackApiUsage,
} from "../../middleware/api-key-auth";
import { requireIdempotency } from "../../middleware/idempotency";
import { paginatedResponse, parsePagination, toSloDto } from "./shared";
import { AppError, notFoundError } from "../../core/app-error";
import { recordAuditLog } from "../../core/audit-log";

// Phase 22 "Enterprise Reliability, SLOs, SLA Monitoring & Service Health"
// Auftragspunkt 12 "API Endpoints" (extern) - dieselbe Tenant-Isolation
// (404 statt 403, organizationId NIE aus dem Client-Body) wie jede andere
// /api/v1-Ressource, siehe routes/v1/incidents.routes.ts (Phase 21).
export const v1SloRouter = Router();

async function assertSloVisible(sloId: number, organizationId: string, teamId: string | null): Promise<Slo> {
  const slo = await getSloById(sloId);
  if (!slo || slo.organizationId !== organizationId) {
    throw notFoundError("SLO nicht gefunden");
  }
  if (teamId && slo.teamId !== teamId) {
    throw notFoundError("SLO nicht gefunden");
  }
  return slo;
}

async function attachCurrentStatus(slos: Slo[]) {
  const evaluations = await getLatestSloEvaluationsForIds(slos.map((s) => s.id));
  return slos.map((slo) => {
    const evaluation = evaluations.get(slo.id);
    return {
      ...toSloDto(slo),
      current: evaluation
        ? { sliValue: evaluation.sliValue, errorBudget: computeErrorBudget(slo.sliType, slo.target, evaluation.sliValue, slo.windowDays), evaluatedAt: evaluation.evaluatedAt }
        : null,
    };
  });
}

v1SloRouter.get(
  "/v1/slo",
  authenticateApiKey,
  requireApiScope("slo:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const pagination = parsePagination(req);
    const slos = await listSlos({ organizationId: context.organizationId, ...(context.teamId ? { teamId: context.teamId } : {}) });
    const page = slos.slice(pagination.offset, pagination.offset + pagination.pageSize);
    res.json(paginatedResponse(await attachCurrentStatus(page), pagination, slos.length));
  },
);

v1SloRouter.get(
  "/v1/slo/:id",
  authenticateApiKey,
  requireApiScope("slo:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ungueltige SLO-ID", code: "VALIDATION_ERROR" });
      return;
    }
    const slo = await assertSloVisible(id, context.organizationId, context.teamId);
    const [withStatus] = await attachCurrentStatus([slo]);
    res.json({ data: withStatus });
  },
);

v1SloRouter.get(
  "/v1/slo/:id/status",
  authenticateApiKey,
  requireApiScope("slo:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ungueltige SLO-ID", code: "VALIDATION_ERROR" });
      return;
    }
    const slo = await assertSloVisible(id, context.organizationId, context.teamId);
    res.json({ data: await getSloCurrentStatus(slo) });
  },
);

const historyQuerySchema = z.object({
  window: z.enum(["1h", "24h", "7d", "30d"]).catch("24h"),
});

v1SloRouter.get(
  "/v1/slo/:id/history",
  authenticateApiKey,
  requireApiScope("slo:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ungueltige SLO-ID", code: "VALIDATION_ERROR" });
      return;
    }
    await assertSloVisible(id, context.organizationId, context.teamId);
    const { window } = historyQuerySchema.parse(req.query);
    const hours = SLO_HISTORY_WINDOW_HOURS[window];
    const to = new Date();
    const from = new Date(to.getTime() - hours * 60 * 60 * 1000);
    res.json({ data: await getSloHistory(id, from, to) });
  },
);

// Bewusst KEIN organizationId im Body (siehe Auftragspunkt 22 "Security" -
// "Client darf organization_id nicht selbst bestimmen") - IMMER aus dem
// API-Key-Kontext, exakt wie bei jeder anderen /v1-Schreib-Route.
const createSloSchema = z
  .object({
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
  .refine((data) => !data.checkId || data.projectId !== undefined, { message: "checkId erfordert projectId" })
  .refine((data) => !(["API_AVAILABILITY", "API_ERROR_RATE"] as SliType[]).includes(data.sliType) || data.checkId === undefined, {
    message: "checkId ist fuer API_AVAILABILITY/API_ERROR_RATE nicht zulaessig",
  })
  .refine((data) => ((["AVAILABILITY", "ERROR_RATE", "LATENCY"] as SliType[]).includes(data.sliType) ? data.projectId !== undefined : true), {
    message: "projectId ist fuer diesen sliType erforderlich",
  });

v1SloRouter.post(
  "/v1/slo",
  authenticateApiKey,
  requireApiScope("slo:write"),
  apiKeyWriteRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  requireIdempotency(),
  async (req: Request, res) => {
    const context = req.apiKeyContext!;
    const parsed = createSloSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Ungueltige Eingabe", code: "VALIDATION_ERROR", details: parsed.error.flatten() });
      return;
    }

    // Projekt-Scope (falls angegeben) muss zur Organisation/zum Team des
    // Keys gehoeren - 404 statt 403 (kein Existenz-Leak, Auftragspunkt 18).
    if (parsed.data.projectId) {
      const projectOrgId = await getProjectOrganizationId(parsed.data.projectId);
      if (!projectOrgId || projectOrgId !== context.organizationId) {
        throw notFoundError("Projekt nicht gefunden");
      }
      if (context.teamId) {
        const teamProjectIds = new Set(await listProjectIdsForTeam(context.teamId));
        if (!teamProjectIds.has(parsed.data.projectId)) {
          throw notFoundError("Projekt nicht gefunden");
        }
      }
    }

    // Team-gebundener Key: ohne teamId im Body erbt die SLO das Team des
    // Keys; mit einer ABWEICHENDEN teamId -> 404 (identisches Muster zu
    // api-keys.routes.ts "team-scoped key creating for a different team").
    // Org-weiter Key: teamId im Body ist optional und wird uebernommen.
    if (context.teamId && parsed.data.teamId && parsed.data.teamId !== context.teamId) {
      throw notFoundError("Team nicht gefunden");
    }
    const teamId = context.teamId ?? parsed.data.teamId;

    const organization = await getOrganizationById(context.organizationId);
    if (!organization) {
      throw notFoundError("Organisation nicht gefunden");
    }
    const limits = getPlanLimits(organization.plan);

    const { projectId, checkId, name, description, sliType, target, latencyThresholdMs, windowDays, enabled } = parsed.data;
    const slo = await createSloIfUnderQuota(
      {
        organizationId: context.organizationId,
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
      },
      limits.sloPerOrganization,
    );
    if (!slo) {
      throw new AppError(409, "CONFLICT", `Plan-Limit erreicht: maximal ${limits.sloPerOrganization} SLOs fuer den Plan ${organization.plan}`);
    }

    void recordAuditLog({
      action: "API_SLO_CREATED",
      category: "SLO",
      ...(slo.projectId ? { projectId: slo.projectId } : {}),
      message: `SLO "${slo.name}" ueber die externe API erstellt`,
      metadata: { apiKeyId: context.apiKeyId, organizationId: context.organizationId, sloId: slo.id },
      ...(req.ip ? { ipAddress: req.ip } : {}),
    });

    res.status(201).json({ data: toSloDto(slo) });
  },
);

const updateSloSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    target: z.number().gt(0).lte(100).optional(),
    latencyThresholdMs: z.number().int().positive().nullable().optional(),
    windowDays: z.number().int().positive().max(400).optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

v1SloRouter.patch(
  "/v1/slo/:id",
  authenticateApiKey,
  requireApiScope("slo:write"),
  apiKeyWriteRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req: Request, res) => {
    const context = req.apiKeyContext!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ungueltige SLO-ID", code: "VALIDATION_ERROR" });
      return;
    }
    const parsed = updateSloSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Ungueltige Eingabe", code: "VALIDATION_ERROR", details: parsed.error.flatten() });
      return;
    }
    await assertSloVisible(id, context.organizationId, context.teamId);
    const { name, description, target, latencyThresholdMs, windowDays, enabled } = parsed.data;
    const updated = await updateSlo(id, {
      ...(name !== undefined ? { name } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(target !== undefined ? { target } : {}),
      ...(latencyThresholdMs !== undefined ? { latencyThresholdMs } : {}),
      ...(windowDays !== undefined ? { windowDays } : {}),
      ...(enabled !== undefined ? { enabled } : {}),
    });
    if (!updated) {
      throw notFoundError("SLO nicht gefunden");
    }
    void recordAuditLog({
      action: "API_SLO_UPDATED",
      category: "SLO",
      ...(updated.projectId ? { projectId: updated.projectId } : {}),
      message: `SLO "${updated.name}" ueber die externe API aktualisiert`,
      metadata: { apiKeyId: context.apiKeyId, organizationId: context.organizationId, sloId: updated.id },
      ...(req.ip ? { ipAddress: req.ip } : {}),
    });
    res.json({ data: toSloDto(updated) });
  },
);

v1SloRouter.delete(
  "/v1/slo/:id",
  authenticateApiKey,
  requireApiScope("slo:write"),
  apiKeyWriteRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ungueltige SLO-ID", code: "VALIDATION_ERROR" });
      return;
    }
    const slo = await assertSloVisible(id, context.organizationId, context.teamId);
    await deleteSlo(id);
    void recordAuditLog({
      action: "API_SLO_DELETED",
      category: "SLO",
      ...(slo.projectId ? { projectId: slo.projectId } : {}),
      message: `SLO "${slo.name}" ueber die externe API geloescht`,
      metadata: { apiKeyId: context.apiKeyId, organizationId: context.organizationId, sloId: slo.id },
      ...(req.ip ? { ipAddress: req.ip } : {}),
    });
    res.status(204).end();
  },
);
