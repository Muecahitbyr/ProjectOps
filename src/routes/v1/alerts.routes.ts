import { Router } from "express";
import {
  countAlertRules,
  createAlertRuleIfUnderQuota,
  deleteAlertRule,
  getAlertRuleById,
  listAlertRules,
  updateAlertRule,
} from "../../db/alerts.repository";
import { getProjectIdsForOrganization, getProjectOrganizationId } from "../../db/projects.repository";
import { getOrganizationById } from "../../db/organizations.repository";
import { getPlanLimits } from "../../config/plan-limits";
import { listProjectIdsForTeam } from "../../db/teams.repository";
import {
  authenticateApiKey,
  apiKeyRateLimiter,
  apiKeyWriteRateLimiter,
  enforceApiQuota,
  requireApiScope,
  trackApiUsage,
} from "../../middleware/api-key-auth";
import { requireIdempotency } from "../../middleware/idempotency";
import { paginatedResponse, parsePagination, toAlertDto } from "./shared";
import { createAlertSchema, normalizeCondition, updateAlertSchema } from "../alerts.routes";
import { AppError, notFoundError } from "../../core/app-error";
import { recordAuditLog } from "../../core/audit-log";
import { broadcast } from "../../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../../realtime/events";
import type { Request } from "express";

// Phase 16 (2. Iteration) Auftragspunkt 3 "Oeffentliche API" - Read-Endpunkt.
// Phase 17 Auftragspunkt 5 "Alert Write API" - ergaenzt POST/PATCH/DELETE/
// enable/disable. Wiederverwendet DIESELBE Validierung wie die interne
// Browser-Session-API (routes/alerts.routes.ts, exportierte Schemas) -
// keine zweite, potenziell abweichende Kopie der Geschaeftsregeln.
export const v1AlertsRouter = Router();

async function resolveOrgAndTeamProjectIds(organizationId: string, teamId: string | null): Promise<string[]> {
  let projectIds = await getProjectIdsForOrganization(organizationId);
  if (teamId) {
    const teamProjectIds = new Set(await listProjectIdsForTeam(teamId));
    projectIds = projectIds.filter((id) => teamProjectIds.has(id));
  }
  return projectIds;
}

// Auftragspunkt 7 "Alert Validation" - Projekt muss zur Organisation (und,
// falls der Key team-gebunden ist, zum Team) des API-Keys gehoeren. 404
// statt 403 fuer fremde Projekte (keine Existenzbestaetigung, Auftragspunkt
// 10/18 "IDOR"/"Tenant Isolation").
async function assertProjectWritable(projectId: string, organizationId: string, teamId: string | null): Promise<void> {
  const projectOrgId = await getProjectOrganizationId(projectId);
  if (!projectOrgId || projectOrgId !== organizationId) {
    throw notFoundError("Projekt nicht gefunden");
  }
  if (teamId) {
    const teamProjectIds = new Set(await listProjectIdsForTeam(teamId));
    if (!teamProjectIds.has(projectId)) {
      throw notFoundError("Projekt nicht gefunden");
    }
  }
}

async function assertRuleWritable(ruleId: number, organizationId: string, teamId: string | null) {
  const rule = await getAlertRuleById(ruleId);
  if (!rule) {
    throw notFoundError("Alert-Regel nicht gefunden");
  }
  await assertProjectWritable(rule.projectId, organizationId, teamId).catch(() => {
    // Einheitliche 404-Meldung fuer "Regel existiert nicht" UND "Regel
    // gehoert zu einem fremden Projekt" - kein Unterschied nach aussen.
    throw notFoundError("Alert-Regel nicht gefunden");
  });
  return rule;
}

v1AlertsRouter.get(
  "/v1/alerts",
  authenticateApiKey,
  requireApiScope("alerts:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const projectIds = await resolveOrgAndTeamProjectIds(context.organizationId, context.teamId);

    const pagination = parsePagination(req);
    if (projectIds.length === 0) {
      res.json(paginatedResponse([], pagination, 0));
      return;
    }

    const [rules, total] = await Promise.all([
      listAlertRules({ projectIds, limit: pagination.pageSize, offset: pagination.offset }),
      countAlertRules({ projectIds }),
    ]);
    res.json(paginatedResponse(rules.map(toAlertDto), pagination, total));
  },
);

// Auftragspunkt 3 "Idempotency Keys" - Pflicht fuer POST /v1/alerts
// (erzeugt eine neue Ressource - eine Wiederholung ohne Schutz wuerde
// Duplikate anlegen).
v1AlertsRouter.post(
  "/v1/alerts",
  authenticateApiKey,
  requireApiScope("alerts:write"),
  apiKeyWriteRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  requireIdempotency(),
  async (req: Request, res) => {
    const context = req.apiKeyContext!;
    const parsed = createAlertSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Ungueltige Eingabe", code: "VALIDATION_ERROR", details: parsed.error.flatten() });
      return;
    }

    await assertProjectWritable(parsed.data.projectId, context.organizationId, context.teamId);

    const { projectId, name, ruleType, severity, metric, comparator, threshold, severityThreshold, windowMinutes, condition, enabled } = parsed.data;

    // Phase 21 Auftragspunkt 17 "Alert Rule Quotas" - dieselbe race-sichere
    // Quota-Pruefung wie die interne Route (routes/alerts.routes.ts), keine
    // zweite Implementierung.
    const organization = await getOrganizationById(context.organizationId);
    if (!organization) {
      throw notFoundError("Organisation nicht gefunden");
    }
    const limits = getPlanLimits(organization.plan);

    const rule = await createAlertRuleIfUnderQuota(
      {
        projectId,
        name,
        metric,
        comparator,
        ...(ruleType !== undefined ? { ruleType } : {}),
        ...(severity !== undefined ? { severity } : {}),
        ...(threshold !== undefined ? { threshold } : {}),
        ...(severityThreshold !== undefined ? { severityThreshold } : {}),
        ...(windowMinutes !== undefined ? { windowMinutes } : {}),
        ...(condition !== undefined ? { condition: normalizeCondition(condition) } : {}),
        ...(enabled !== undefined ? { enabled } : {}),
        // Bewusst KEIN createdBy - das waere eine interne Benutzer-id, ein
        // API-Key authentifiziert keinen einzelnen Menschen (siehe
        // types/api-scope.types.ts, ApiKeyAuthContext).
      },
      context.organizationId,
      limits.alertRulesPerOrganization,
    );
    if (!rule) {
      throw new AppError(409, "CONFLICT", `Plan-Limit erreicht: maximal ${limits.alertRulesPerOrganization} Alert-Regeln fuer den Plan ${organization.plan}`);
    }

    broadcast(createEvent(RealtimeEventType.ALERT_CREATED, rule));
    void recordAuditLog({
      action: "API_ALERT_CREATED",
      category: "ALERT",
      projectId: rule.projectId,
      message: `Alert-Regel "${rule.name}" ueber die externe API erstellt`,
      metadata: { apiKeyId: context.apiKeyId, organizationId: context.organizationId, alertRuleId: rule.id },
      ...(req.ip ? { ipAddress: req.ip } : {}),
    });

    res.status(201).json({ data: toAlertDto(rule) });
  },
);

v1AlertsRouter.patch(
  "/v1/alerts/:id",
  authenticateApiKey,
  requireApiScope("alerts:write"),
  apiKeyWriteRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req: Request, res) => {
    const context = req.apiKeyContext!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ungueltige Alert-Regel-ID", code: "VALIDATION_ERROR" });
      return;
    }

    const before = await assertRuleWritable(id, context.organizationId, context.teamId);

    const parsed = updateAlertSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Ungueltige Eingabe", code: "VALIDATION_ERROR", details: parsed.error.flatten() });
      return;
    }

    const { name, ruleType, severity, metric, comparator, threshold, severityThreshold, windowMinutes, condition, enabled } = parsed.data;
    const updated = await updateAlertRule(id, {
      ...(name !== undefined ? { name } : {}),
      ...(ruleType !== undefined ? { ruleType } : {}),
      ...(severity !== undefined ? { severity } : {}),
      ...(metric !== undefined ? { metric } : {}),
      ...(comparator !== undefined ? { comparator } : {}),
      ...(threshold !== undefined ? { threshold } : {}),
      ...(severityThreshold !== undefined ? { severityThreshold } : {}),
      ...(windowMinutes !== undefined ? { windowMinutes } : {}),
      ...(condition !== undefined ? { condition: condition === null ? null : normalizeCondition(condition) } : {}),
      ...(enabled !== undefined ? { enabled } : {}),
    });
    if (!updated) {
      throw notFoundError("Alert-Regel nicht gefunden");
    }

    if (before.enabled && !updated.enabled) {
      broadcast(createEvent(RealtimeEventType.ALERT_DEACTIVATED, updated));
    } else {
      broadcast(createEvent(RealtimeEventType.ALERT_UPDATED, updated));
    }
    void recordAuditLog({
      action: "API_ALERT_UPDATED",
      category: "ALERT",
      projectId: updated.projectId,
      message: `Alert-Regel "${updated.name}" ueber die externe API aktualisiert`,
      metadata: { apiKeyId: context.apiKeyId, organizationId: context.organizationId, alertRuleId: updated.id },
      ...(req.ip ? { ipAddress: req.ip } : {}),
    });

    res.json({ data: toAlertDto(updated) });
  },
);

v1AlertsRouter.delete(
  "/v1/alerts/:id",
  authenticateApiKey,
  requireApiScope("alerts:write"),
  apiKeyWriteRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req: Request, res) => {
    const context = req.apiKeyContext!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ungueltige Alert-Regel-ID", code: "VALIDATION_ERROR" });
      return;
    }

    const before = await assertRuleWritable(id, context.organizationId, context.teamId);
    const deleted = await deleteAlertRule(id);
    if (!deleted) {
      throw notFoundError("Alert-Regel nicht gefunden");
    }

    broadcast(createEvent(RealtimeEventType.ALERT_DELETED, { id, projectId: before.projectId, name: before.name }));
    void recordAuditLog({
      action: "API_ALERT_DELETED",
      category: "ALERT",
      projectId: before.projectId,
      message: `Alert-Regel "${before.name}" ueber die externe API geloescht`,
      metadata: { apiKeyId: context.apiKeyId, organizationId: context.organizationId, alertRuleId: id },
      ...(req.ip ? { ipAddress: req.ip } : {}),
    });

    res.status(204).end();
  },
);

async function setEnabled(req: Request, res: import("express").Response, enabled: boolean): Promise<void> {
  const context = req.apiKeyContext!;
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Alert-Regel-ID", code: "VALIDATION_ERROR" });
    return;
  }

  await assertRuleWritable(id, context.organizationId, context.teamId);
  const updated = await updateAlertRule(id, { enabled });
  if (!updated) {
    throw notFoundError("Alert-Regel nicht gefunden");
  }

  if (enabled) {
    broadcast(createEvent(RealtimeEventType.ALERT_UPDATED, updated));
  } else {
    broadcast(createEvent(RealtimeEventType.ALERT_DEACTIVATED, updated));
  }
  void recordAuditLog({
    action: "API_ALERT_UPDATED",
    category: "ALERT",
    projectId: updated.projectId,
    message: `Alert-Regel "${updated.name}" ueber die externe API ${enabled ? "aktiviert" : "deaktiviert"}`,
    metadata: { apiKeyId: context.apiKeyId, organizationId: context.organizationId, alertRuleId: updated.id },
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });

  res.json({ data: toAlertDto(updated) });
}

v1AlertsRouter.post(
  "/v1/alerts/:id/enable",
  authenticateApiKey,
  requireApiScope("alerts:write"),
  apiKeyWriteRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  (req: Request, res) => setEnabled(req, res, true),
);

v1AlertsRouter.post(
  "/v1/alerts/:id/disable",
  authenticateApiKey,
  requireApiScope("alerts:write"),
  apiKeyWriteRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  (req: Request, res) => setEnabled(req, res, false),
);
