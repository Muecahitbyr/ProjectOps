import { Router } from "express";
import { z } from "zod";
import { getAutomationExecutionById, listAutomationExecutions } from "../db/automation-executions.repository";
import { listAutomationLogsForExecution } from "../db/automation-logs.repository";
import { getExecutionOutcome } from "../core/automation-outcome-verification";
import { authenticate } from "../middleware/authenticate";
import { notFoundError } from "../core/app-error";

export const automationExecutionsRouter = Router();

const listQuerySchema = z.object({
  projectId: z.string().trim().min(1).optional(),
  status: z.enum(["CREATED", "APPROVED", "RUNNING", "SUCCESS", "FAILED", "CANCELLED"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).catch(100),
});

// Teil 3 "Automation Dashboard" (Executions-/History-Tab) und Teil 6
// "Execution Logs" - projektuebergreifende Sicht ueber alle Ausfuehrungen,
// unabhaengig von der ausloesenden Aktion (anders als
// GET /automation-actions/:id/executions in automation-actions.routes.ts,
// das auf eine einzelne Aktion beschraenkt ist).
automationExecutionsRouter.get("/automation-executions", authenticate, async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Filter", details: parsed.error.flatten() });
    return;
  }
  const { projectId, status, limit } = parsed.data;
  res.json(await listAutomationExecutions({ ...(projectId ? { projectId } : {}), ...(status ? { status } : {}), limit }));
});

automationExecutionsRouter.get("/automation-executions/:id", authenticate, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Ausfuehrungs-ID" });
    return;
  }
  const execution = await getAutomationExecutionById(id);
  if (!execution) {
    throw notFoundError("Ausfuehrung nicht gefunden");
  }
  res.json(execution);
});

const logsQuerySchema = z.object({ level: z.enum(["INFO", "WARN", "ERROR"]).optional() });

automationExecutionsRouter.get("/automation-executions/:id/logs", authenticate, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Ausfuehrungs-ID" });
    return;
  }
  const parsed = logsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Filter", details: parsed.error.flatten() });
    return;
  }
  res.json(await listAutomationLogsForExecution(id, parsed.data.level));
});

// Phase 51 "Enterprise Decision Execution & Closed-Loop Operations" - reiner
// Lese-Endpunkt (core/automation-outcome-verification.ts berechnet
// PENDING/NOT_APPLICABLE live, liest bereits abgeschlossene Bewertungen aus
// dem bestehenden Audit-Trail) - keine neue Schreibflaeche, dieselbe
// Autorisierung (nur authenticate) wie jede andere Route in diesem Router.
automationExecutionsRouter.get("/automation-executions/:id/outcome", authenticate, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Ausfuehrungs-ID" });
    return;
  }
  const outcome = await getExecutionOutcome(id);
  if (!outcome) {
    throw notFoundError("Ausfuehrung nicht gefunden");
  }
  res.json(outcome);
});
