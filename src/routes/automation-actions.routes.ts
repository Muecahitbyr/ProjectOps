import { Router } from "express";
import { z } from "zod";
import { getAutomationActionById, listAutomationActions, updateAutomationActionStatus } from "../db/automation.repository";
import { getAutomationRuleById } from "../db/automation-rules.repository";
import { listExecutionsForAction } from "../db/automation-executions.repository";
import { hasAutomationExecutor } from "../automation/safe-action-runner";
import { runAutomationExecution } from "../automation/execution-runner";
import { authenticate } from "../middleware/authenticate";
import { authorizeRole } from "../middleware/authorize";
import { AppError, notFoundError } from "../core/app-error";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";
import { recordAuditLog } from "../core/audit-log";
import type { RoleId } from "../types/user.types";

const MANAGE_ROLES: RoleId[] = ["OWNER", "ADMIN"];

export const automationActionsRouter = Router();

async function resolveProjectIdFromActionParam(req: import("express").Request): Promise<string | undefined> {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return undefined;
  const action = await getAutomationActionById(id);
  return action?.projectId;
}

// Auftragspunkt 9 "Self Healing Vorbereitung" (Phase 9) / "Automation Engine
// Foundation" (Phase 10) / Teil 1+2+4 "Enterprise Automation & Self-Healing"
// (Phase 11): status=PROPOSED entspricht dem in Teil 4 beschriebenen
// WAITING_APPROVAL-Zustand (kein neuer DB-Wert - siehe automation-engine.ts).
automationActionsRouter.get("/automation-actions", authenticate, async (req, res) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
  const status = typeof req.query.status === "string" ? (req.query.status as "PROPOSED" | "APPROVED" | "REJECTED") : undefined;
  res.json(await listAutomationActions({ ...(projectId ? { projectId } : {}), ...(status ? { status } : {}) }));
});

const updateStatusSchema = z.object({ status: z.enum(["APPROVED", "REJECTED"]) });

// Teil 4 "Approval Workflow" - OWNER/ADMIN duerfen freigeben (authorizeRole
// unten), Realtime-Update fuer beide Ausgaenge.
automationActionsRouter.patch(
  "/automation-actions/:id",
  authenticate,
  authorizeRole(MANAGE_ROLES, resolveProjectIdFromActionParam),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ungueltige Automatisierungs-ID" });
      return;
    }

    const parsed = updateStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
      return;
    }

    const action = await getAutomationActionById(id);
    if (!action) {
      throw notFoundError("Automatisierungsvorschlag nicht gefunden");
    }

    const updated = await updateAutomationActionStatus(id, parsed.data.status);
    if (!updated) {
      // Phase 66: Compare-and-Swap in updateAutomationActionStatus() schlug
      // fehl - der Vorschlag ist nicht (mehr) PROPOSED (bereits von einem
      // gleichzeitigen Request genehmigt/abgelehnt).
      throw new AppError(409, "CONFLICT", "Automatisierungsvorschlag ist nicht (mehr) PROPOSED - Aktion nicht moeglich");
    }
    if (updated && req.userId) {
      const payload = { action: updated, userId: req.userId };
      broadcast(
        parsed.data.status === "APPROVED"
          ? createEvent(RealtimeEventType.AUTOMATION_APPROVED, payload)
          : createEvent(RealtimeEventType.AUTOMATION_REJECTED, payload),
      );
      void recordAuditLog({
        userId: req.userId,
        action: parsed.data.status === "APPROVED" ? "AUTOMATION_APPROVED" : "AUTOMATION_REJECTED",
        category: "AUTOMATION",
        projectId: updated.projectId,
        message: `Automatisierung "${updated.action}" ${parsed.data.status === "APPROVED" ? "genehmigt" : "abgelehnt"}`,
        ...(req.ip ? { ipAddress: req.ip } : {}),
      });
    }
    res.json(updated);
  },
);

automationActionsRouter.get(
  "/automation-actions/:id/executions",
  authenticate,
  authorizeRole(MANAGE_ROLES, resolveProjectIdFromActionParam),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ungueltige Automatisierungs-ID" });
      return;
    }
    res.json(await listExecutionsForAction(id));
  },
);

const executeSchema = z.object({ dryRun: z.boolean().optional() });

automationActionsRouter.post(
  "/automation-actions/:id/execute",
  authenticate,
  authorizeRole(MANAGE_ROLES, resolveProjectIdFromActionParam),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ungueltige Automatisierungs-ID" });
      return;
    }

    const parsed = executeSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
      return;
    }

    const action = await getAutomationActionById(id);
    if (!action) {
      throw notFoundError("Automatisierungsvorschlag nicht gefunden");
    }
    if (action.status !== "APPROVED") {
      throw new AppError(400, "VALIDATION_ERROR", "Aktion muss zuerst genehmigt werden (status=APPROVED)");
    }
    if (!hasAutomationExecutor(action.action)) {
      throw new AppError(400, "VALIDATION_ERROR", `Fuer "${action.action}" existiert keine Ausfuehrungslogik`);
    }

    // Phase 30 Auftragspunkt 2 "Timeout" - falls diese Aktion auf eine Regel
    // zurueckfuehrbar ist, deren konfigurierten Timeout uebernehmen statt des
    // generischen Defaults (execution-runner.ts).
    const rule = action.ruleId !== null ? await getAutomationRuleById(action.ruleId) : undefined;

    const execution = await runAutomationExecution(action, {
      dryRun: parsed.data.dryRun ?? false,
      ...(rule !== undefined ? { timeoutSeconds: rule.timeoutSeconds } : {}),
      ...(req.userId !== undefined ? { approvedBy: req.userId, executedBy: req.userId } : {}),
    });

    // Phase 30 Auftragspunkt 5 "Race Safety" - zwei parallele /execute-
    // Aufrufe fuer dieselbe Aktion: der zweite trifft auf die partielle
    // Unique-Constraint (Migration 0053) und bekommt sauber 409 statt eines
    // rohen 500 oder einer zweiten, gleichzeitig laufenden Ausfuehrung.
    if (execution === "ALREADY_RUNNING") {
      res.status(409).json({ error: "Fuer diese Aktion laeuft bereits eine Ausfuehrung", code: "ALREADY_RUNNING" });
      return;
    }

    void recordAuditLog({
      ...(req.userId ? { userId: req.userId } : {}),
      action: "AUTOMATION_EXECUTED",
      category: "AUTOMATION",
      severity: execution.status === "SUCCESS" ? "INFO" : "WARNING",
      projectId: action.projectId,
      message: `Automatisierung "${action.action}" ausgefuehrt (${execution.status}${parsed.data.dryRun ? ", dryRun" : ""})`,
      ...(req.ip ? { ipAddress: req.ip } : {}),
    });

    res.status(execution.status === "SUCCESS" ? 200 : 502).json(execution);
  },
);
