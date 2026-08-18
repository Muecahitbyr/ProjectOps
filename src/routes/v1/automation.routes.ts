import { Router } from "express";
import { z } from "zod";
import { countAutomationActions, getAutomationActionById, listAutomationActions } from "../../db/automation.repository";
import { getAutomationRuleById } from "../../db/automation-rules.repository";
import {
  countAutomationExecutions,
  getAutomationExecutionById,
  listAutomationExecutions,
} from "../../db/automation-executions.repository";
import { countAutomationLogsForExecution, listAutomationLogsForExecution } from "../../db/automation-logs.repository";
import { getProjectIdsForOrganization, getProjectOrganizationId } from "../../db/projects.repository";
import { listProjectIdsForTeam } from "../../db/teams.repository";
import { hasAutomationExecutor } from "../../automation/safe-action-runner";
import { runAutomationExecution } from "../../automation/execution-runner";
import { getExecutionOutcome } from "../../core/automation-outcome-verification";
import {
  authenticateApiKey,
  apiKeyExecuteRateLimiter,
  apiKeyRateLimiter,
  enforceApiQuota,
  enforceAutomationExecutionQuota,
  requireApiScope,
  trackApiUsage,
} from "../../middleware/api-key-auth";
import { requireIdempotency } from "../../middleware/idempotency";
import { paginatedResponse, parsePagination, toAutomationActionDto, toAutomationExecutionDto, toAutomationLogDto } from "./shared";
import { AppError, notFoundError } from "../../core/app-error";
import { recordAuditLog } from "../../core/audit-log";
import { broadcast } from "../../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../../realtime/events";

// Phase 17 Auftragspunkt 8/9 "Automation Read API"/"Automation Execute
// API". Liest ausschliesslich aus den bestehenden Repositories (um
// projectIds/offset erweitert) und fuehrt Aktionen ueber denselben
// runAutomationExecution()/executeSafeAction()-Pfad aus wie die interne UI
// (routes/automation-actions.routes.ts) - keine zweite Ausfuehrungslogik,
// keine vom Client frei waehlbaren Befehle.
export const v1AutomationRouter = Router();

async function resolveTenantProjectIds(organizationId: string, teamId: string | null): Promise<string[]> {
  let projectIds = await getProjectIdsForOrganization(organizationId);
  if (teamId) {
    const teamProjectIds = new Set(await listProjectIdsForTeam(teamId));
    projectIds = projectIds.filter((id) => teamProjectIds.has(id));
  }
  return projectIds;
}

async function assertActionAccessible(projectId: string, organizationId: string, teamId: string | null): Promise<void> {
  const projectOrgId = await getProjectOrganizationId(projectId);
  if (!projectOrgId || projectOrgId !== organizationId) {
    throw notFoundError("Automatisierungsvorschlag nicht gefunden");
  }
  if (teamId) {
    const teamProjectIds = new Set(await listProjectIdsForTeam(teamId));
    if (!teamProjectIds.has(projectId)) {
      throw notFoundError("Automatisierungsvorschlag nicht gefunden");
    }
  }
}

v1AutomationRouter.get(
  "/v1/automation/actions",
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

    const statusParam = typeof req.query.status === "string" ? req.query.status : undefined;
    const status = statusParam === "PROPOSED" || statusParam === "APPROVED" || statusParam === "REJECTED" ? statusParam : undefined;

    const [actions, total] = await Promise.all([
      listAutomationActions({ projectIds, ...(status ? { status } : {}), limit: pagination.pageSize, offset: pagination.offset }),
      countAutomationActions({ projectIds, ...(status ? { status } : {}) }),
    ]);
    res.json(paginatedResponse(actions.map(toAutomationActionDto), pagination, total));
  },
);

v1AutomationRouter.get(
  "/v1/automation/actions/:id",
  authenticateApiKey,
  requireApiScope("automation:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ungueltige Automatisierungs-ID", code: "VALIDATION_ERROR" });
      return;
    }

    const action = await getAutomationActionById(id);
    if (!action) {
      throw notFoundError("Automatisierungsvorschlag nicht gefunden");
    }
    await assertActionAccessible(action.projectId, context.organizationId, context.teamId);
    res.json({ data: toAutomationActionDto(action) });
  },
);

v1AutomationRouter.get(
  "/v1/automation/executions",
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

    const [executions, total] = await Promise.all([
      listAutomationExecutions({ projectIds, limit: pagination.pageSize, offset: pagination.offset }),
      countAutomationExecutions({ projectIds }),
    ]);
    res.json(paginatedResponse(executions.map(toAutomationExecutionDto), pagination, total));
  },
);

async function assertExecutionAccessible(executionId: number, organizationId: string, teamId: string | null) {
  const execution = await getAutomationExecutionById(executionId);
  if (!execution) {
    throw notFoundError("Ausfuehrung nicht gefunden");
  }
  const action = await getAutomationActionById(execution.automationActionId);
  if (!action) {
    throw notFoundError("Ausfuehrung nicht gefunden");
  }
  await assertActionAccessible(action.projectId, organizationId, teamId).catch(() => {
    throw notFoundError("Ausfuehrung nicht gefunden");
  });
  return execution;
}

v1AutomationRouter.get(
  "/v1/automation/executions/:id",
  authenticateApiKey,
  requireApiScope("automation:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ungueltige Ausfuehrungs-ID", code: "VALIDATION_ERROR" });
      return;
    }
    const execution = await assertExecutionAccessible(id, context.organizationId, context.teamId);
    res.json({ data: toAutomationExecutionDto(execution) });
  },
);

v1AutomationRouter.get(
  "/v1/automation/executions/:id/logs",
  authenticateApiKey,
  requireApiScope("automation:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ungueltige Ausfuehrungs-ID", code: "VALIDATION_ERROR" });
      return;
    }
    await assertExecutionAccessible(id, context.organizationId, context.teamId);

    const pagination = parsePagination(req);
    const [logs, total] = await Promise.all([
      listAutomationLogsForExecution(id, undefined, pagination.pageSize, pagination.offset),
      countAutomationLogsForExecution(id),
    ]);
    res.json(paginatedResponse(logs.map(toAutomationLogDto), pagination, total));
  },
);

// Phase 51 "Enterprise Decision Execution & Closed-Loop Operations" -
// derselbe automation:read-Scope, dieselbe assertExecutionAccessible()-
// Tenant-Pruefung wie die Executions-Endpunkte oben.
v1AutomationRouter.get(
  "/v1/automation/executions/:id/outcome",
  authenticateApiKey,
  requireApiScope("automation:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ungueltige Ausfuehrungs-ID", code: "VALIDATION_ERROR" });
      return;
    }
    await assertExecutionAccessible(id, context.organizationId, context.teamId);
    const outcome = await getExecutionOutcome(id);
    if (!outcome) {
      throw notFoundError("Ausfuehrung nicht gefunden");
    }
    res.json({ data: outcome });
  },
);

const executeSchema = z.object({ dryRun: z.boolean().optional() });

// Auftragspunkt 9/11 "Automation Execute API"/"Approval Workflow" -
// zentraler Sicherheits-Kern der Phase: eine Ausfuehrung findet NUR statt,
// wenn die Aktion bereits (ueber den bestehenden, unveraenderten
// Freigabe-Workflow - routes/automation-actions.routes.ts, OWNER/ADMIN via
// Browser-Session) den Status APPROVED hat. Ein API-Key kann diesen Status
// selbst NICHT setzen (kein PATCH-Endpunkt hier) - er kann eine bereits
// genehmigte Aktion nur ausloesen, niemals genehmigen.
v1AutomationRouter.post(
  "/v1/automation/actions/:id/execute",
  authenticateApiKey,
  requireApiScope("automation:execute"),
  apiKeyExecuteRateLimiter,
  enforceApiQuota,
  enforceAutomationExecutionQuota,
  trackApiUsage,
  requireIdempotency(),
  async (req, res) => {
    const context = req.apiKeyContext!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ungueltige Automatisierungs-ID", code: "VALIDATION_ERROR" });
      return;
    }

    const parsed = executeSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "Ungueltige Eingabe", code: "VALIDATION_ERROR", details: parsed.error.flatten() });
      return;
    }

    const action = await getAutomationActionById(id);
    if (!action) {
      throw notFoundError("Automatisierungsvorschlag nicht gefunden");
    }
    await assertActionAccessible(action.projectId, context.organizationId, context.teamId);

    if (action.status === "PROPOSED") {
      void recordAuditLog({
        action: "API_AUTOMATION_EXECUTION_REQUESTED",
        category: "AUTOMATION",
        severity: "WARNING",
        projectId: action.projectId,
        message: `Externe Ausfuehrung von "${action.action}" angefragt, aber noch nicht genehmigt - abgelehnt`,
        metadata: { apiKeyId: context.apiKeyId, organizationId: context.organizationId, automationActionId: action.id },
        ...(req.ip ? { ipAddress: req.ip } : {}),
      });
      broadcast(createEvent(RealtimeEventType.API_AUTOMATION_EXECUTION_REQUESTED, action));
      throw new AppError(403, "FORBIDDEN", "Diese Aktion wartet noch auf menschliche Freigabe (status=PROPOSED) und kann ueber die API nicht direkt ausgefuehrt werden");
    }

    if (action.status === "REJECTED") {
      void recordAuditLog({
        action: "API_AUTOMATION_REJECTED",
        category: "AUTOMATION",
        severity: "WARNING",
        projectId: action.projectId,
        message: `Externe Ausfuehrung von "${action.action}" angefragt, Aktion wurde aber bereits abgelehnt`,
        metadata: { apiKeyId: context.apiKeyId, organizationId: context.organizationId, automationActionId: action.id },
        ...(req.ip ? { ipAddress: req.ip } : {}),
      });
      throw new AppError(403, "FORBIDDEN", "Diese Aktion wurde bereits abgelehnt (status=REJECTED) und kann nicht ausgefuehrt werden");
    }

    if (!hasAutomationExecutor(action.action)) {
      throw new AppError(400, "VALIDATION_ERROR", `Fuer "${action.action}" existiert keine Ausfuehrungslogik`);
    }

    // approvedBy/executedBy bleiben bewusst ungesetzt (keine interne
    // Benutzer-id vorhanden) - die Nachvollziehbarkeit, WELCHER API-Key
    // ausgefuehrt hat, steht stattdessen im Audit-Log-Metadata unten.
    const rule = action.ruleId !== null ? await getAutomationRuleById(action.ruleId) : undefined;
    const execution = await runAutomationExecution(action, {
      dryRun: parsed.data.dryRun ?? false,
      ...(rule !== undefined ? { timeoutSeconds: rule.timeoutSeconds } : {}),
    });

    // Phase 30 Auftragspunkt 5 "Race Safety" - siehe routes/incidents.
    // routes.ts/routes/automation-actions.routes.ts fuer denselben Fall.
    if (execution === "ALREADY_RUNNING") {
      res.status(409).json({ error: "Fuer diese Aktion laeuft bereits eine Ausfuehrung", code: "ALREADY_RUNNING" });
      return;
    }

    void recordAuditLog({
      action: "API_AUTOMATION_EXECUTED",
      category: "AUTOMATION",
      severity: execution.status === "SUCCESS" ? "INFO" : "WARNING",
      projectId: action.projectId,
      message: `Automatisierung "${action.action}" ueber die externe API ausgefuehrt (${execution.status}${parsed.data.dryRun ? ", dryRun" : ""})`,
      metadata: { apiKeyId: context.apiKeyId, organizationId: context.organizationId, automationActionId: action.id, executionId: execution.id },
      ...(req.ip ? { ipAddress: req.ip } : {}),
    });

    res.status(execution.status === "SUCCESS" ? 200 : 502).json({ data: toAutomationExecutionDto(execution) });
  },
);
