import { Router } from "express";
import { z } from "zod";
import { monitorService } from "../core/monitor";
import { createAlertRuleIfUnderQuota, deleteAlertRule, getAlertRuleById, listAlertRules, updateAlertRule } from "../db/alerts.repository";
import { listEscalationSteps, replaceEscalationSteps } from "../db/alert-events.repository";
import { getProjectOrganizationId } from "../db/projects.repository";
import { getOrganizationById } from "../db/organizations.repository";
import { getSloOrganizationId } from "../db/slo.repository";
import { getOnCallScheduleOrganizationId } from "../db/on-call.repository";
import { getPlanLimits } from "../config/plan-limits";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";
import { recordAuditLog } from "../core/audit-log";
import { authenticate } from "../middleware/authenticate";
import { authorizeRole } from "../middleware/authorize";
import { AppError } from "../core/app-error";
import type { AlertCondition, CreateEscalationStepInput } from "../types/alert.types";
import type { RoleId } from "../types/user.types";

const MANAGE_ROLES: RoleId[] = ["OWNER", "ADMIN"];

export const alertsRouter = Router();

const METRICS = [
  "HEALTH_SCORE",
  "INCIDENT_SEVERITY",
  "OFFLINE_DURATION",
  "SSL_EXPIRY",
  "RESPONSE_TIME",
  "ERROR_COUNT",
  "MULTIPLE_CHECKS_OFFLINE",
  "INCIDENT_SPIKE",
  // Phase 22 Auftragspunkt 9 "SLO Alerting".
  "SLO_BREACH",
  "SLO_BURN_RATE",
] as const;
const SLO_METRICS = ["SLO_BREACH", "SLO_BURN_RATE"] as const;
const COMPARATORS = ["LT", "LTE", "GT", "GTE", "EQ"] as const;
const SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
const RULE_TYPES = ["THRESHOLD", "TREND", "ANOMALY", "COMPOSITE"] as const;
const RULE_SEVERITIES = ["INFO", "WARNING", "HIGH", "CRITICAL"] as const;
const NOTIFICATION_CHANNELS = ["EMAIL", "PUSH", "IN_APP", "WEBSOCKET"] as const;
const PROJECT_ROLES = ["OWNER", "ADMIN", "DEVELOPER", "VIEWER"] as const;

// Phase 9 "Intelligent Alert Engine" - Bedingungen fuer TREND/ANOMALY/
// COMPOSITE-Regeln, siehe types/alert.types.ts (AlertCondition).
const trendConditionSchema = z.object({
  type: z.literal("TREND"),
  metric: z.enum(["HEALTH_SCORE", "RESPONSE_TIME", "ERROR_COUNT"]),
  direction: z.enum(["DECREASING", "INCREASING"]),
  consecutivePoints: z.number().int().min(2).max(20),
  bucketMinutes: z.number().int().min(1).max(1440),
});
const anomalyConditionSchema = z.object({
  type: z.literal("ANOMALY"),
  metric: z.enum(["ERROR_COUNT", "RESPONSE_TIME"]),
  windowMinutes: z.number().int().min(1).max(1440),
  baselineWindowMinutes: z.number().int().min(1).max(10080),
  stdDevMultiplier: z.number().min(0.1).max(10),
});
const compositeConditionSchema = z.object({
  type: z.literal("COMPOSITE"),
  mode: z.enum(["MULTIPLE_CHECKS_OFFLINE", "INCIDENT_SPIKE"]),
  minCount: z.number().int().min(1).max(1000),
  windowMinutes: z.number().int().min(1).max(1440).optional(),
});
const conditionSchema = z.discriminatedUnion("type", [trendConditionSchema, anomalyConditionSchema, compositeConditionSchema]);

// zod's .optional() erzeugt "T | undefined" (Schluessel immer vorhanden,
// Wert ggf. undefined); die Domain-Typen in types/alert.types.ts nutzen
// dagegen "T?" (Schluessel optional, kein expliziter undefined-Wert) fuer
// exactOptionalPropertyTypes - windowMinutes (nur bei COMPOSITE optional)
// muss daher beim Uebergang normalisiert werden.
// Exportiert fuer Wiederverwendung durch routes/v1/alerts.routes.ts
// (Auftragspunkt 5 "Alert Write API") - dieselbe Validierungslogik statt
// einer zweiten, potenziell abweichenden Kopie fuer die externe API.
export function normalizeCondition(condition: z.infer<typeof conditionSchema>): AlertCondition {
  if (condition.type !== "COMPOSITE") return condition;
  return {
    type: "COMPOSITE",
    mode: condition.mode,
    minCount: condition.minCount,
    ...(condition.windowMinutes !== undefined ? { windowMinutes: condition.windowMinutes } : {}),
  };
}

export const createAlertSchema = z
  .object({
    projectId: z.string().trim().min(1),
    name: z.string().trim().min(1).max(200),
    ruleType: z.enum(RULE_TYPES).optional(),
    severity: z.enum(RULE_SEVERITIES).optional(),
    metric: z.enum(METRICS),
    comparator: z.enum(COMPARATORS),
    threshold: z.number().finite().optional(),
    severityThreshold: z.enum(SEVERITIES).optional(),
    windowMinutes: z.number().int().positive().optional(),
    condition: conditionSchema.optional(),
    sloId: z.number().int().positive().optional(),
    enabled: z.boolean().optional(),
    createdBy: z.string().trim().min(1).optional(),
  })
  // Phase 21 - echte, beim Live-E2E-Test gefundene Luecke: fehlte hier im
  // Unterschied zu praktisch jedem anderen Create-Schema dieser Codebase
  // (z.B. api-keys.routes.ts) - unbekannte Felder (z.B. "currentlyTriggered",
  // "id") wurden bisher stillschweigend ignoriert statt abgelehnt.
  .strict()
  .refine(
    (data) => {
      const ruleType = data.ruleType ?? "THRESHOLD";
      if (ruleType === "THRESHOLD") {
        return data.metric === "INCIDENT_SEVERITY" ? data.severityThreshold !== undefined : data.threshold !== undefined;
      }
      return data.condition !== undefined && data.condition.type === ruleType;
    },
    {
      message:
        "THRESHOLD-Regeln benoetigen threshold (bzw. severityThreshold fuer INCIDENT_SEVERITY); TREND/ANOMALY/COMPOSITE benoetigen ein zum ruleType passendes condition-Objekt",
    },
  )
  .refine((data) => ((data.ruleType ?? "THRESHOLD") === "THRESHOLD" && data.metric === "ERROR_COUNT" ? data.windowMinutes !== undefined : true), {
    message: "windowMinutes ist fuer ERROR_COUNT erforderlich",
  })
  // Phase 22 Auftragspunkt 9 "SLO Alerting" - spiegelt die DB-CHECK-Constraint
  // alert_rules_slo_id_by_metric (0042_slo_and_reliability.sql): sloId ist
  // fuer SLO_BREACH/SLO_BURN_RATE zwingend, fuer jede andere Metrik verboten
  // (sonst liesse sich eine SLO an eine fachlich unpassende Metrik haengen).
  .refine((data) => (SLO_METRICS as readonly string[]).includes(data.metric) === (data.sloId !== undefined), {
    message: "sloId ist fuer SLO_BREACH/SLO_BURN_RATE erforderlich und fuer jede andere Metrik unzulaessig",
  });

export const updateAlertSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    ruleType: z.enum(RULE_TYPES).optional(),
    severity: z.enum(RULE_SEVERITIES).optional(),
    metric: z.enum(METRICS).optional(),
    comparator: z.enum(COMPARATORS).optional(),
    threshold: z.number().finite().nullable().optional(),
    severityThreshold: z.enum(SEVERITIES).nullable().optional(),
    windowMinutes: z.number().int().positive().nullable().optional(),
    condition: conditionSchema.nullable().optional(),
    sloId: z.number().int().positive().nullable().optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

const escalationStepsSchema = z.object({
  steps: z
    .array(
      z.object({
        stepOrder: z.number().int().min(1),
        afterMinutes: z.number().int().min(0),
        channelId: z.enum(NOTIFICATION_CHANNELS),
        additionalProjectRole: z.enum(PROJECT_ROLES).optional(),
        // Phase 24 "Enterprise On-Call Scheduling & Escalation Routing" -
        // optional: siehe types/alert.types.ts#AlertEscalationStep.
        onCallScheduleId: z.number().int().positive().nullable().optional(),
      }),
    )
    .max(10),
});

async function resolveProjectIdFromBody(req: import("express").Request): Promise<string | undefined> {
  return typeof req.body?.projectId === "string" ? req.body.projectId : undefined;
}

async function resolveProjectIdFromRuleParam(req: import("express").Request): Promise<string | undefined> {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return undefined;
  const rule = await getAlertRuleById(id);
  return rule?.projectId;
}

alertsRouter.get("/alerts", authenticate, async (req, res) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
  res.json(await listAlertRules({ ...(projectId ? { projectId } : {}) }));
});

alertsRouter.post("/alerts", authenticate, authorizeRole(MANAGE_ROLES, resolveProjectIdFromBody), async (req, res) => {
  const parsed = createAlertSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }

  if (!monitorService.getProject(parsed.data.projectId)) {
    res.status(404).json({ error: "Projekt nicht gefunden" });
    return;
  }

  const { projectId, name, ruleType, severity, metric, comparator, threshold, severityThreshold, windowMinutes, condition, sloId, enabled, createdBy } =
    parsed.data;

  // Phase 21 Auftragspunkt 17 "Alert Rule Quotas" - echte gefundene Luecke:
  // Alert-Regeln hatten bislang UEBERHAUPT kein Limit. Race-sicher ueber
  // createAlertRuleIfUnderQuota() (siehe Repository-Kommentar), analog zu
  // maxApiKeys/automationRulesPerOrganization.
  const organizationId = await getProjectOrganizationId(projectId);
  if (!organizationId) {
    res.status(404).json({ error: "Projekt nicht gefunden" });
    return;
  }
  const organization = await getOrganizationById(organizationId);
  if (!organization) {
    res.status(404).json({ error: "Organisation nicht gefunden" });
    return;
  }
  const limits = getPlanLimits(organization.plan);

  // Phase 22 Auftragspunkt 9 "SLO Alerting" - eine referenzierte SLO muss
  // zur SELBEN Organisation wie das Zielprojekt gehoeren, sonst koennte eine
  // Alert-Regel Zustand aus einer fremden Organisation sichtbar machen
  // (Tenant-Isolation, Auftragspunkt 18).
  if (sloId !== undefined) {
    const sloOrgId = await getSloOrganizationId(sloId);
    if (!sloOrgId || sloOrgId !== organizationId) {
      res.status(404).json({ error: "SLO nicht gefunden" });
      return;
    }
  }

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
      ...(sloId !== undefined ? { sloId } : {}),
      ...(enabled !== undefined ? { enabled } : {}),
      ...(createdBy !== undefined ? { createdBy } : {}),
    },
    organizationId,
    limits.alertRulesPerOrganization,
  );
  if (!rule) {
    throw new AppError(409, "CONFLICT", `Plan-Limit erreicht: maximal ${limits.alertRulesPerOrganization} Alert-Regeln fuer den Plan ${organization.plan}`);
  }
  broadcast(createEvent(RealtimeEventType.ALERT_CREATED, rule));
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "ALERT_RULE_CREATED",
    category: "ALERT",
    projectId: rule.projectId,
    message: `Alert-Regel "${rule.name}" erstellt`,
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.status(201).json(rule);
});

alertsRouter.get("/alerts/:id", authenticate, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Alert-Regel-ID" });
    return;
  }

  const rule = await getAlertRuleById(id);
  if (!rule) {
    res.status(404).json({ error: "Alert-Regel nicht gefunden" });
    return;
  }
  res.json(rule);
});

alertsRouter.patch("/alerts/:id", authenticate, authorizeRole(MANAGE_ROLES, resolveProjectIdFromRuleParam), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Alert-Regel-ID" });
    return;
  }

  const parsed = updateAlertSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }

  const before = await getAlertRuleById(id);
  if (!before) {
    res.status(404).json({ error: "Alert-Regel nicht gefunden" });
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
    res.status(404).json({ error: "Alert-Regel nicht gefunden" });
    return;
  }

  // Eigenes Event fuer die Deaktivierung (explizit im Auftrag genannt),
  // sonst das generische ALERT_UPDATED.
  if (before.enabled && !updated.enabled) {
    broadcast(createEvent(RealtimeEventType.ALERT_DEACTIVATED, updated));
  } else {
    broadcast(createEvent(RealtimeEventType.ALERT_UPDATED, updated));
  }

  res.json(updated);
});

alertsRouter.delete("/alerts/:id", authenticate, authorizeRole(MANAGE_ROLES, resolveProjectIdFromRuleParam), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Alert-Regel-ID" });
    return;
  }

  const before = await getAlertRuleById(id);
  const deleted = await deleteAlertRule(id);
  if (!deleted) {
    res.status(404).json({ error: "Alert-Regel nicht gefunden" });
    return;
  }
  // Phase 17 - bisher fehlender Realtime-Broadcast fuer Loeschungen
  // nachgeruestet (ALERT_CREATED/UPDATED/DEACTIVATED broadcasteten bereits,
  // DELETE nicht - echter, waehrend Phase 17 gefundener Bug, siehe
  // Abschlussbericht). Kommt sowohl der Browser-UI als auch der neuen
  // externen API zugute.
  if (before) {
    broadcast(createEvent(RealtimeEventType.ALERT_DELETED, { id, projectId: before.projectId, name: before.name }));
  }
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "ALERT_RULE_DELETED",
    category: "ALERT",
    ...(before?.projectId ? { projectId: before.projectId } : {}),
    message: `Alert-Regel "${before?.name ?? id}" geloescht`,
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.status(204).end();
});

alertsRouter.get("/alerts/:id/escalation", authenticate, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Alert-Regel-ID" });
    return;
  }
  if (!(await getAlertRuleById(id))) {
    res.status(404).json({ error: "Alert-Regel nicht gefunden" });
    return;
  }
  res.json(await listEscalationSteps(id));
});

alertsRouter.put("/alerts/:id/escalation", authenticate, authorizeRole(MANAGE_ROLES, resolveProjectIdFromRuleParam), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Alert-Regel-ID" });
    return;
  }
  const rule = await getAlertRuleById(id);
  if (!rule) {
    res.status(404).json({ error: "Alert-Regel nicht gefunden" });
    return;
  }

  const parsed = escalationStepsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }

  const orders = parsed.data.steps.map((step) => step.stepOrder);
  if (new Set(orders).size !== orders.length) {
    res.status(400).json({ error: "stepOrder muss innerhalb der Eskalationskette eindeutig sein" });
    return;
  }

  // Auftragspunkt "Tenant-/Team-Isolation" - ein referenziertes On-Call-
  // Schedule MUSS zur selben Organisation gehoeren wie die Alert-Regel
  // (transitiv ueber deren project_id), sonst koennte eine Eskalationsstufe
  // den Diensthabenden einer FREMDEN Organisation preisgeben (indirekter
  // Tenant-Leak, dasselbe Prinzip wie die projectId/teamId-Pruefung beim
  // Anlegen eines Service, routes/platform-services.routes.ts, Phase 23).
  const scheduleIds = [...new Set(parsed.data.steps.map((s) => s.onCallScheduleId).filter((v): v is number => v !== undefined && v !== null))];
  if (scheduleIds.length > 0) {
    const organizationId = await getProjectOrganizationId(rule.projectId);
    for (const scheduleId of scheduleIds) {
      const scheduleOrgId = await getOnCallScheduleOrganizationId(scheduleId);
      if (!scheduleOrgId || scheduleOrgId !== organizationId) {
        res.status(400).json({ error: `On-Call-Schedule ${scheduleId} gehoert nicht zur Organisation dieser Alert-Regel` });
        return;
      }
    }
  }

  const steps: CreateEscalationStepInput[] = parsed.data.steps.map((step) => ({
    stepOrder: step.stepOrder,
    afterMinutes: step.afterMinutes,
    channelId: step.channelId,
    ...(step.additionalProjectRole !== undefined ? { additionalProjectRole: step.additionalProjectRole } : {}),
    ...(step.onCallScheduleId !== undefined ? { onCallScheduleId: step.onCallScheduleId } : {}),
  }));
  res.json(await replaceEscalationSteps(id, steps));
});
