import { Router } from "express";
import { z } from "zod";
import {
  createAutomationRule,
  deleteAutomationRule,
  getAutomationRuleById,
  listAutomationRules,
  updateAutomationRule,
} from "../db/automation-rules.repository";
import { AUTO_EXECUTABLE_ACTIONS } from "../automation/safe-action-runner";
import { detectAutomationRuleConflicts } from "../core/governance-rule-conflicts";
import { authenticate } from "../middleware/authenticate";
import { authorizeRole } from "../middleware/authorize";
import { notFoundError } from "../core/app-error";
import { recordAuditLog } from "../core/audit-log";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";
import type { RoleId } from "../types/user.types";
import type { Request } from "express";

const MANAGE_ROLES: RoleId[] = ["OWNER", "ADMIN"];

export const automationRulesRouter = Router();

const ACTION_VALUES = [
  "RESTART_SERVICE", "CLEAR_CACHE", "RUN_HEALTH_CHECK", "CREATE_DIAGNOSTIC_SNAPSHOT", "COLLECT_LOGS",
  "RESTART_CONTAINER", "RESTART_MONITOR", "RETRY_CHECK", "RELOAD_CONFIGURATION",
  "FLUSH_QUEUE", "CREATE_BACKUP", "VERIFY_DEPENDENCIES",
] as const;
export const SEVERITY_VALUES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
// Phase 30 "Enterprise Reliability, Automated Recovery & Operational
// Resilience" Auftragspunkt 2 "Recovery Actions" - dieselbe Skala wie
// SEVERITY_VALUES, bewusst als eigene Konstante (unterschiedliche fachliche
// Bedeutung: Risiko EINER Wiederholung dieser Aktion, nicht Incident-Schweregrad).
export const RISK_LEVEL_VALUES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const TRIGGER_VALUES = [
  "INCIDENT_CREATED", "INCIDENT_RESOLVED", "ALERT_TRIGGERED", "ALERT_ESCALATED",
  "PROJECT_CRITICAL", "PROJECT_WARNING", "CHECK_FAILED", "CHECK_RECOVERED",
  "MAINTENANCE_STARTED", "MAINTENANCE_ENDED", "ROOT_INCIDENT_CREATED",
  // Phase 40 "Enterprise Resilience-Driven Automation".
  "RESILIENCE_DEGRADED", "RESILIENCE_RECOVERED",
  // Phase 49 "Enterprise Risk Forecasting & Proactive Operations Intelligence".
  "PROACTIVE_RISK_DETECTED", "PROACTIVE_RISK_CLEARED",
] as const;
// Muss mit safe-action-runner.ts (AUTO_EXECUTABLE_ACTIONS) und der
// DB-Constraint automation_rules_auto_execute_safe_only (Migration 0030)
// uebereinstimmen.
const AUTO_EXECUTABLE_SET = new Set<string>(AUTO_EXECUTABLE_ACTIONS);

// Exportiert fuer Wiederverwendung durch routes/v1/automation-rules.routes.ts
// (Phase 18 Auftragspunkt 3 "Serverseitige Validierung") - dieselbe
// conditions-Validierung, keine zweite Kopie. TRIGGER_VALUES/SEVERITY_VALUES
// ebenfalls wiederverwendet - nur die erlaubten ACTIONS unterscheiden sich
// bewusst (siehe dortige striktere Whitelist).
export const conditionsSchema = z
  .object({
    healthScoreBelow: z.number().min(0).max(100).optional(),
    healthScoreAbove: z.number().min(0).max(100).optional(),
    checkType: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

// zod's .optional() erzeugt "T | undefined" (Schluessel immer vorhanden,
// Wert ggf. undefined); AutomationRuleConditions nutzt dagegen "T?"
// (Schluessel optional, kein expliziter undefined-Wert) fuer
// exactOptionalPropertyTypes - siehe dieselbe Normalisierung in
// alerts.routes.ts (normalizeCondition).
export function normalizeConditions(
  conditions: z.infer<typeof conditionsSchema>,
): { healthScoreBelow?: number; healthScoreAbove?: number; checkType?: string } {
  return {
    ...(conditions.healthScoreBelow !== undefined ? { healthScoreBelow: conditions.healthScoreBelow } : {}),
    ...(conditions.healthScoreAbove !== undefined ? { healthScoreAbove: conditions.healthScoreAbove } : {}),
    ...(conditions.checkType !== undefined ? { checkType: conditions.checkType } : {}),
  };
}

async function resolveProjectIdFromBody(req: Request): Promise<string | undefined> {
  return typeof req.body?.projectId === "string" ? req.body.projectId : undefined;
}

async function resolveProjectIdFromRuleParam(req: Request): Promise<string | undefined> {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return undefined;
  const rule = await getAutomationRuleById(id);
  return rule?.projectId;
}

automationRulesRouter.get("/automation-rules", authenticate, async (req, res) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
  res.json(await listAutomationRules({ ...(projectId ? { projectId } : {}) }));
});

// Phase 61 "Enterprise Operational Governance Optimization" - reine
// Lese-Diagnose ueber bereits bestehende Regeln (siehe core/governance-
// rule-conflicts.ts), dieselbe authenticate-only-Konvention wie GET
// /automation-rules oben (kein staerkerer Autorisierungs-Standard fuer
// nur diese eine Route).
automationRulesRouter.get("/automation-rules/conflicts", authenticate, async (req, res) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
  if (!projectId) {
    res.status(400).json({ error: "projectId ist erforderlich" });
    return;
  }
  res.json(await detectAutomationRuleConflicts(projectId));
});

const createSchema = z
  .object({
    projectId: z.string().trim().min(1),
    name: z.string().trim().min(1).max(200),
    checkType: z.string().trim().min(1).max(100).optional(),
    minSeverity: z.enum(SEVERITY_VALUES),
    trigger: z.enum(TRIGGER_VALUES),
    priority: z.number().int().min(1).max(10_000).default(100),
    conditions: conditionsSchema.optional(),
    action: z.enum(ACTION_VALUES),
    autoExecute: z.boolean().default(false),
    approvalRequired: z.boolean().default(true),
    cooldownMinutes: z.number().int().min(0).max(10_080).default(15),
    maxExecutionsPerHour: z.number().int().min(1).max(1000).default(10),
    enabled: z.boolean().default(true),
    riskLevel: z.enum(RISK_LEVEL_VALUES).default("MEDIUM"),
    timeoutSeconds: z.number().int().min(1).max(3600).default(60),
    maxAttemptsPerIncident: z.number().int().min(1).max(20).default(3),
  })
  .strict()
  .refine((data) => !data.autoExecute || AUTO_EXECUTABLE_SET.has(data.action), {
    message: `auto_execute ist nur fuer folgende Aktionen erlaubt: ${AUTO_EXECUTABLE_ACTIONS.join(", ")}`,
    path: ["autoExecute"],
  })
  .refine((data) => data.riskLevel !== "CRITICAL" || data.approvalRequired, {
    message: "Risiko CRITICAL erfordert approvalRequired=true",
    path: ["riskLevel"],
  });

automationRulesRouter.post(
  "/automation-rules",
  authenticate,
  authorizeRole(MANAGE_ROLES, resolveProjectIdFromBody),
  async (req, res) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
      return;
    }

    const { projectId, name, checkType, minSeverity, trigger, priority, conditions, action, autoExecute, approvalRequired, cooldownMinutes, maxExecutionsPerHour, enabled, riskLevel, timeoutSeconds, maxAttemptsPerIncident } = parsed.data;
    const rule = await createAutomationRule({
      projectId,
      name,
      minSeverity,
      trigger,
      priority,
      action,
      autoExecute,
      approvalRequired,
      cooldownMinutes,
      maxExecutionsPerHour,
      enabled,
      riskLevel,
      timeoutSeconds,
      maxAttemptsPerIncident,
      ...(checkType !== undefined ? { checkType } : {}),
      ...(conditions !== undefined ? { conditions: normalizeConditions(conditions) } : {}),
      ...(req.userId !== undefined ? { createdBy: req.userId } : {}),
    });

    // Phase 18 - bisher fehlender Realtime-/Audit-Broadcast fuer
    // Automation-Regeln nachgeruestet (automation_rules broadcastete seit
    // Phase 9 ueberhaupt nichts - echter, waehrend Phase 18 gefundener Bug,
    // siehe Abschlussbericht). Kommt sowohl der Browser-UI als auch der
    // neuen externen API zugute (dieselben Events, siehe realtime/events.ts).
    broadcast(createEvent(RealtimeEventType.AUTOMATION_RULE_CREATED, rule));
    void recordAuditLog({
      ...(req.userId ? { userId: req.userId } : {}),
      action: "AUTOMATION_RULE_CREATED",
      category: "AUTOMATION",
      projectId: rule.projectId,
      message: `Automatisierungsregel "${rule.name}" erstellt`,
      ...(req.ip ? { ipAddress: req.ip } : {}),
    });
    res.status(201).json(rule);
  },
);

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    checkType: z.string().trim().min(1).max(100).nullable().optional(),
    minSeverity: z.enum(SEVERITY_VALUES).optional(),
    trigger: z.enum(TRIGGER_VALUES).optional(),
    priority: z.number().int().min(1).max(10_000).optional(),
    conditions: conditionsSchema.nullable().optional(),
    action: z.enum(ACTION_VALUES).optional(),
    autoExecute: z.boolean().optional(),
    approvalRequired: z.boolean().optional(),
    cooldownMinutes: z.number().int().min(0).max(10_080).optional(),
    maxExecutionsPerHour: z.number().int().min(1).max(1000).optional(),
    enabled: z.boolean().optional(),
    riskLevel: z.enum(RISK_LEVEL_VALUES).optional(),
    timeoutSeconds: z.number().int().min(1).max(3600).optional(),
    maxAttemptsPerIncident: z.number().int().min(1).max(20).optional(),
  })
  .strict()
  .refine((data) => !data.autoExecute || !data.action || AUTO_EXECUTABLE_SET.has(data.action), {
    message: `auto_execute ist nur fuer folgende Aktionen erlaubt: ${AUTO_EXECUTABLE_ACTIONS.join(", ")}`,
    path: ["autoExecute"],
  })
  .refine((data) => data.riskLevel !== "CRITICAL" || data.approvalRequired !== false, {
    message: "Risiko CRITICAL erfordert approvalRequired=true",
    path: ["riskLevel"],
  });

automationRulesRouter.patch(
  "/automation-rules/:id",
  authenticate,
  authorizeRole(MANAGE_ROLES, resolveProjectIdFromRuleParam),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ungueltige Regel-ID" });
      return;
    }

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
      return;
    }

    const existingRule = await getAutomationRuleById(id);
    if (!existingRule) {
      throw notFoundError("Automatisierungsregel nicht gefunden");
    }

    const { name, checkType, minSeverity, trigger, priority, conditions, action, autoExecute, approvalRequired, cooldownMinutes, maxExecutionsPerHour, enabled, riskLevel, timeoutSeconds, maxAttemptsPerIncident } = parsed.data;

    // Die Zod-.refine()-Pruefung oben sieht nur das, was IN DIESEM Request
    // mitgeschickt wurde - ein PATCH, der nur approvalRequired=false setzt,
    // waere sonst gegen den kombinierten (gespeicherten + neuen) Zustand
    // nicht geprueft und wuerde erst an der DB-CHECK-Constraint (Migration
    // 0053) als rohem 500 statt einem sauberen 400 scheitern.
    const effectiveRisk = riskLevel ?? existingRule.riskLevel;
    const effectiveApproval = approvalRequired ?? existingRule.approvalRequired;
    if (effectiveRisk === "CRITICAL" && !effectiveApproval) {
      res.status(400).json({ error: "Risiko CRITICAL erfordert approvalRequired=true", code: "VALIDATION_ERROR" });
      return;
    }

    const updated = await updateAutomationRule(id, {
      ...(name !== undefined ? { name } : {}),
      ...(checkType !== undefined ? { checkType } : {}),
      ...(minSeverity !== undefined ? { minSeverity } : {}),
      ...(trigger !== undefined ? { trigger } : {}),
      ...(priority !== undefined ? { priority } : {}),
      ...(conditions !== undefined ? { conditions: conditions === null ? null : normalizeConditions(conditions) } : {}),
      ...(action !== undefined ? { action } : {}),
      ...(autoExecute !== undefined ? { autoExecute } : {}),
      ...(approvalRequired !== undefined ? { approvalRequired } : {}),
      ...(cooldownMinutes !== undefined ? { cooldownMinutes } : {}),
      ...(maxExecutionsPerHour !== undefined ? { maxExecutionsPerHour } : {}),
      ...(enabled !== undefined ? { enabled } : {}),
      ...(riskLevel !== undefined ? { riskLevel } : {}),
      ...(timeoutSeconds !== undefined ? { timeoutSeconds } : {}),
      ...(maxAttemptsPerIncident !== undefined ? { maxAttemptsPerIncident } : {}),
    });
    if (!updated) {
      throw notFoundError("Automatisierungsregel nicht gefunden");
    }

    broadcast(createEvent(RealtimeEventType.AUTOMATION_RULE_UPDATED, updated));
    void recordAuditLog({
      ...(req.userId ? { userId: req.userId } : {}),
      action: "AUTOMATION_RULE_UPDATED",
      category: "AUTOMATION",
      projectId: updated.projectId,
      message: `Automatisierungsregel "${updated.name}" aktualisiert`,
      ...(req.ip ? { ipAddress: req.ip } : {}),
    });
    res.json(updated);
  },
);

automationRulesRouter.delete(
  "/automation-rules/:id",
  authenticate,
  authorizeRole(MANAGE_ROLES, resolveProjectIdFromRuleParam),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ungueltige Regel-ID" });
      return;
    }

    const before = await getAutomationRuleById(id);
    const deleted = await deleteAutomationRule(id);
    if (!deleted) {
      throw notFoundError("Automatisierungsregel nicht gefunden");
    }

    if (before) {
      broadcast(createEvent(RealtimeEventType.AUTOMATION_RULE_DELETED, { id, projectId: before.projectId, name: before.name }));
    }
    void recordAuditLog({
      ...(req.userId ? { userId: req.userId } : {}),
      action: "AUTOMATION_RULE_DELETED",
      category: "AUTOMATION",
      ...(before?.projectId ? { projectId: before.projectId } : {}),
      message: `Automatisierungsregel "${before?.name ?? id}" geloescht`,
      ...(req.ip ? { ipAddress: req.ip } : {}),
    });
    res.status(204).end();
  },
);
