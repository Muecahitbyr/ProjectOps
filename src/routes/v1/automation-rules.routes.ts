import { Router } from "express";
import { z } from "zod";
import {
  countAutomationRules,
  countAutomationRulesForOrganization,
  createAutomationRule,
  deleteAutomationRule,
  getAutomationRuleById,
  listAutomationRules,
  updateAutomationRule,
} from "../../db/automation-rules.repository";
import { AUTO_EXECUTABLE_ACTIONS } from "../../automation/safe-action-runner";
import type { AutomationActionType } from "../../types/automation.types";
import { conditionsSchema, normalizeConditions, SEVERITY_VALUES, TRIGGER_VALUES } from "../automation-rules.routes";
import { getProjectIdsForOrganization, getProjectOrganizationId } from "../../db/projects.repository";
import { getTeamById, listProjectIdsForTeam } from "../../db/teams.repository";
import { getOrganizationById } from "../../db/organizations.repository";
import {
  authenticateApiKey,
  apiKeyRateLimiter,
  apiKeyWriteRateLimiter,
  enforceApiQuota,
  requireApiScope,
  trackApiUsage,
} from "../../middleware/api-key-auth";
import { requireIdempotency } from "../../middleware/idempotency";
import { getPlanLimits } from "../../config/plan-limits";
import { paginatedResponse, parsePagination, toAutomationRuleDto } from "./shared";
import { AppError, notFoundError } from "../../core/app-error";
import { recordAuditLog } from "../../core/audit-log";
import { broadcast } from "../../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../../realtime/events";

// Phase 18 Auftragspunkt 1/2 "Automation Rule Write API"/"Keine freien
// Automation-Aktionen" - liest/schreibt ausschliesslich ueber das
// bestehende automation-rules.repository.ts (dieselbe Tabelle, dieselbe
// Automation-Engine-Auswertung wie die interne UI - kein zweiter
// Automation-Unterbau). Die Whitelist der erlaubten `action`-Werte ist
// bewusst ENGER als bei der internen Route: AUTO_EXECUTABLE_ACTIONS ist
// die bereits bestehende, etablierte "sicher genug fuer unbeaufsichtigte
// Ausfuehrung"-Menge (Phase 11, safe-action-runner.ts) - wenn eine Aktion
// nicht einmal fuer eine vom SYSTEM automatisch ausgefuehrte, von einem
// Menschen bereits konfigurierte Regel sicher genug ist, ist sie erst
// recht nicht sicher genug fuer eine von einem externen API-Key komplett
// neu angelegte Regel. RESTART_CONTAINER/RESTART_SERVICE sind damit
// automatisch ausgeschlossen, ohne eine zweite, parallele Sicherheitsliste
// zu pflegen.
export const v1AutomationRulesRouter = Router();

const EXTERNALLY_ALLOWED_ACTIONS = AUTO_EXECUTABLE_ACTIONS as [AutomationActionType, ...AutomationActionType[]];
const ALLOWED_ACTION_SET = new Set<string>(EXTERNALLY_ALLOWED_ACTIONS);

// .strict() lehnt unbekannte Felder ab (Auftragspunkt 3: "keine unbekannten
// Felder") - insbesondere organizationId/approvedBy/executedBy/command/
// shell/exec/script/containerName sind schlicht NICHT Teil des Schemas und
// werden dadurch automatisch mit 400 VALIDATION_ERROR abgelehnt, ganz ohne
// Sonderbehandlung dieser konkreten Feldnamen.
const createRuleSchema = z
  .object({
    projectId: z.string().trim().min(1),
    teamId: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).max(200),
    checkType: z.string().trim().min(1).max(100).optional(),
    minSeverity: z.enum(SEVERITY_VALUES),
    trigger: z.enum(TRIGGER_VALUES),
    priority: z.number().int().min(1).max(10_000).default(100),
    conditions: conditionsSchema.optional(),
    action: z.enum(EXTERNALLY_ALLOWED_ACTIONS),
    autoExecute: z.boolean().default(false),
    approvalRequired: z.boolean().default(true),
    cooldownMinutes: z.number().int().min(0).max(10_080).default(15),
    maxExecutionsPerHour: z.number().int().min(1).max(1000).default(10),
    enabled: z.boolean().default(true),
  })
  .strict()
  .refine((data) => !data.autoExecute || ALLOWED_ACTION_SET.has(data.action), {
    message: `auto_execute ist nur fuer folgende Aktionen erlaubt: ${EXTERNALLY_ALLOWED_ACTIONS.join(", ")}`,
    path: ["autoExecute"],
  });

const updateRuleSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    teamId: z.string().trim().min(1).nullable().optional(),
    checkType: z.string().trim().min(1).max(100).nullable().optional(),
    minSeverity: z.enum(SEVERITY_VALUES).optional(),
    trigger: z.enum(TRIGGER_VALUES).optional(),
    priority: z.number().int().min(1).max(10_000).optional(),
    conditions: conditionsSchema.nullable().optional(),
    action: z.enum(EXTERNALLY_ALLOWED_ACTIONS).optional(),
    autoExecute: z.boolean().optional(),
    approvalRequired: z.boolean().optional(),
    cooldownMinutes: z.number().int().min(0).max(10_080).optional(),
    maxExecutionsPerHour: z.number().int().min(1).max(1000).optional(),
    enabled: z.boolean().optional(),
  })
  .strict()
  .refine((data) => !data.autoExecute || !data.action || ALLOWED_ACTION_SET.has(data.action), {
    message: `auto_execute ist nur fuer folgende Aktionen erlaubt: ${EXTERNALLY_ALLOWED_ACTIONS.join(", ")}`,
    path: ["autoExecute"],
  });

async function resolveTenantProjectIds(organizationId: string, teamId: string | null): Promise<string[]> {
  let projectIds = await getProjectIdsForOrganization(organizationId);
  if (teamId) {
    const teamProjectIds = new Set(await listProjectIdsForTeam(teamId));
    projectIds = projectIds.filter((id) => teamProjectIds.has(id));
  }
  return projectIds;
}

// Auftragspunkt 4 "Tenant Isolation" - 404 (nicht 403) fuer fremde
// Projekte/Regeln, konsistent mit allen bisherigen /api/v1-Endpunkten
// (kein IDOR/Enumeration).
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
  const rule = await getAutomationRuleById(ruleId);
  if (!rule) {
    throw notFoundError("Automatisierungsregel nicht gefunden");
  }
  await assertProjectWritable(rule.projectId, organizationId, teamId).catch(() => {
    throw notFoundError("Automatisierungsregel nicht gefunden");
  });
  return rule;
}

v1AutomationRulesRouter.get(
  "/v1/automation/rules",
  authenticateApiKey,
  requireApiScope("automation:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const projectIds = await resolveTenantProjectIds(context.organizationId, context.teamId);
    const pagination = parsePagination(req);
    if (projectIds.length === 0) {
      res.json(paginatedResponse([], pagination, 0));
      return;
    }

    const [rules, total] = await Promise.all([
      listAutomationRules({ projectIds, limit: pagination.pageSize, offset: pagination.offset }),
      countAutomationRules({ projectIds }),
    ]);
    res.json(paginatedResponse(rules.map(toAutomationRuleDto), pagination, total));
  },
);

v1AutomationRulesRouter.get(
  "/v1/automation/rules/:id",
  authenticateApiKey,
  requireApiScope("automation:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ungueltige Regel-ID", code: "VALIDATION_ERROR" });
      return;
    }
    const rule = await assertRuleWritable(id, context.organizationId, context.teamId);
    res.json({ data: toAutomationRuleDto(rule) });
  },
);

v1AutomationRulesRouter.post(
  "/v1/automation/rules",
  authenticateApiKey,
  requireApiScope("automation:write"),
  apiKeyWriteRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  requireIdempotency(),
  async (req, res) => {
    const context = req.apiKeyContext!;
    const parsed = createRuleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Ungueltige Eingabe", code: "VALIDATION_ERROR", details: parsed.error.flatten() });
      return;
    }

    const { projectId, teamId, name, checkType, minSeverity, trigger, priority, conditions, action, autoExecute, approvalRequired, cooldownMinutes, maxExecutionsPerHour, enabled } =
      parsed.data;

    await assertProjectWritable(projectId, context.organizationId, context.teamId);

    // Auftragspunkt 3 "keine Moeglichkeit, organizationId frei zu setzen" -
    // teamId (falls im Body angegeben) muss ebenfalls real zur
    // Organisation dieses API-Keys gehoeren, sonst koennte eine Regel
    // faelschlich mit dem Team-Kontext einer FREMDEN Organisation versehen
    // werden.
    if (teamId) {
      const team = await getTeamById(teamId);
      if (!team || team.organizationId !== context.organizationId) {
        throw notFoundError("Team nicht gefunden oder gehoert nicht zu dieser Organisation");
      }
    }

    // Auftragspunkt 7 "Quota" (automationRulesPerOrganization) - organisationsweit,
    // nicht pro API-Key umgehbar (dieselbe COUNT-Abfrage wie fuer maxApiKeys/
    // maxServiceAccounts, nur ueber automation_rules statt api_keys).
    const organization = await getOrganizationById(context.organizationId);
    if (!organization) {
      throw notFoundError("Organisation nicht gefunden");
    }
    const limits = getPlanLimits(organization.plan);
    const currentRuleCount = await countAutomationRulesForOrganization(context.organizationId);
    if (currentRuleCount >= limits.automationRulesPerOrganization) {
      // Nicht zeitabhaengig (kein taegliches Reset) - daher bewusst OHNE
      // Retry-After, wie bei maxApiKeys/maxServiceAccounts (Auftragspunkt 7:
      // "Retry-After nur bei zeitabhaengigen Quotas").
      throw new AppError(
        409,
        "CONFLICT",
        `Plan-Limit erreicht: maximal ${limits.automationRulesPerOrganization} Automation-Regeln fuer den Plan ${organization.plan}`,
      );
    }

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
      ...(teamId !== undefined ? { teamId } : {}),
      ...(checkType !== undefined ? { checkType } : {}),
      ...(conditions !== undefined ? { conditions: normalizeConditions(conditions) } : {}),
      // Bewusst KEIN createdBy - keine interne Benutzer-id vorhanden (siehe
      // ApiKeyAuthContext). Nachvollziehbarkeit steht im Audit-Log-Metadata.
    });

    broadcast(createEvent(RealtimeEventType.AUTOMATION_RULE_CREATED, rule));
    void recordAuditLog({
      action: "API_AUTOMATION_RULE_CREATED",
      category: "AUTOMATION",
      projectId: rule.projectId,
      message: `Automatisierungsregel "${rule.name}" ueber die externe API erstellt`,
      metadata: { apiKeyId: context.apiKeyId, organizationId: context.organizationId, automationRuleId: rule.id },
      ...(req.ip ? { ipAddress: req.ip } : {}),
    });

    res.status(201).json({ data: toAutomationRuleDto(rule) });
  },
);

v1AutomationRulesRouter.patch(
  "/v1/automation/rules/:id",
  authenticateApiKey,
  requireApiScope("automation:write"),
  apiKeyWriteRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ungueltige Regel-ID", code: "VALIDATION_ERROR" });
      return;
    }

    await assertRuleWritable(id, context.organizationId, context.teamId);

    const parsed = updateRuleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Ungueltige Eingabe", code: "VALIDATION_ERROR", details: parsed.error.flatten() });
      return;
    }

    const { name, teamId, checkType, minSeverity, trigger, priority, conditions, action, autoExecute, approvalRequired, cooldownMinutes, maxExecutionsPerHour, enabled } = parsed.data;

    if (teamId) {
      const team = await getTeamById(teamId);
      if (!team || team.organizationId !== context.organizationId) {
        throw notFoundError("Team nicht gefunden oder gehoert nicht zu dieser Organisation");
      }
    }

    const updated = await updateAutomationRule(id, {
      ...(name !== undefined ? { name } : {}),
      ...(teamId !== undefined ? { teamId } : {}),
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
    });
    if (!updated) {
      throw notFoundError("Automatisierungsregel nicht gefunden");
    }

    broadcast(createEvent(RealtimeEventType.AUTOMATION_RULE_UPDATED, updated));
    void recordAuditLog({
      action: "API_AUTOMATION_RULE_UPDATED",
      category: "AUTOMATION",
      projectId: updated.projectId,
      message: `Automatisierungsregel "${updated.name}" ueber die externe API aktualisiert`,
      metadata: { apiKeyId: context.apiKeyId, organizationId: context.organizationId, automationRuleId: updated.id },
      ...(req.ip ? { ipAddress: req.ip } : {}),
    });

    res.json({ data: toAutomationRuleDto(updated) });
  },
);

v1AutomationRulesRouter.delete(
  "/v1/automation/rules/:id",
  authenticateApiKey,
  requireApiScope("automation:write"),
  apiKeyWriteRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ungueltige Regel-ID", code: "VALIDATION_ERROR" });
      return;
    }

    const before = await assertRuleWritable(id, context.organizationId, context.teamId);
    const deleted = await deleteAutomationRule(id);
    if (!deleted) {
      throw notFoundError("Automatisierungsregel nicht gefunden");
    }

    broadcast(createEvent(RealtimeEventType.AUTOMATION_RULE_DELETED, { id, projectId: before.projectId, name: before.name }));
    void recordAuditLog({
      action: "API_AUTOMATION_RULE_DELETED",
      category: "AUTOMATION",
      projectId: before.projectId,
      message: `Automatisierungsregel "${before.name}" ueber die externe API geloescht`,
      metadata: { apiKeyId: context.apiKeyId, organizationId: context.organizationId, automationRuleId: id },
      ...(req.ip ? { ipAddress: req.ip } : {}),
    });

    res.status(204).end();
  },
);
