import { Router } from "express";
import { z } from "zod";
import { monitorService } from "../core/monitor";
import {
  createMaintenanceWindowIfNoOverlap,
  deleteMaintenanceWindow,
  getMaintenanceWindowById,
  listMaintenanceWindows,
  listSuppressedFailuresForWindow,
} from "../db/maintenance.repository";
import { authenticate } from "../middleware/authenticate";
import { authorizeRole } from "../middleware/authorize";
import { recordAuditLog } from "../core/audit-log";
import { AppError, notFoundError } from "../core/app-error";
import type { RoleId } from "../types/user.types";

const MANAGE_ROLES: RoleId[] = ["OWNER", "ADMIN"];

export const maintenanceRouter = Router();

const createSchema = z
  .object({
    projectId: z.string().trim().min(1),
    startsAt: z.string().trim().min(1),
    endsAt: z.string().trim().min(1),
    reason: z.string().trim().min(1).max(500),
    createdBy: z.string().trim().min(1).optional(),
  })
  .refine((data) => !Number.isNaN(new Date(data.startsAt).getTime()) && !Number.isNaN(new Date(data.endsAt).getTime()), {
    message: "startsAt/endsAt muessen gueltige Zeitstempel sein",
  })
  .refine((data) => new Date(data.endsAt) > new Date(data.startsAt), { message: "endsAt muss nach startsAt liegen" });

async function resolveProjectIdFromBody(req: import("express").Request): Promise<string | undefined> {
  return typeof req.body?.projectId === "string" ? req.body.projectId : undefined;
}

async function resolveProjectIdFromWindowParam(req: import("express").Request): Promise<string | undefined> {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return undefined;
  const window = await getMaintenanceWindowById(id);
  return window?.projectId;
}

// MAINTENANCE_STARTED/MAINTENANCE_ENDED werden bewusst nicht hier, sondern
// ausschliesslich vom Scheduler (core/monitor.ts) gebroadcastet - der
// erkennt den tatsaechlichen Uebergang anhand von now() vs. [starts_at,
// ends_at) bei jedem Tick. Ein zusaetzlicher Broadcast hier wuerde entweder
// verfruehte "STARTED"-Events fuer erst in der Zukunft beginnende Fenster
// erzeugen oder bei DELETE zu einem doppelten "ENDED"-Event fuehren, sobald
// der naechste Scheduler-Tick denselben Uebergang ohnehin erkennt.
maintenanceRouter.get("/maintenance", authenticate, async (req, res) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : undefined;
  const changeIdRaw = req.query.changeId;
  const changeId = typeof changeIdRaw === "string" && Number.isInteger(Number(changeIdRaw)) ? Number(changeIdRaw) : undefined;
  res.json(await listMaintenanceWindows({ ...(projectId ? { projectId } : {}), ...(changeId !== undefined ? { changeId } : {}) }));
});

maintenanceRouter.post("/maintenance", authenticate, authorizeRole(MANAGE_ROLES, resolveProjectIdFromBody), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }

  if (!monitorService.getProject(parsed.data.projectId)) {
    res.status(404).json({ error: "Projekt nicht gefunden" });
    return;
  }

  const { projectId, startsAt, endsAt, reason, createdBy } = parsed.data;
  const window = await createMaintenanceWindowIfNoOverlap({
    projectId,
    startsAt,
    endsAt,
    reason,
    ...(createdBy !== undefined ? { createdBy } : {}),
  });
  if (!window) {
    throw new AppError(409, "CONFLICT", "Ueberschneidet sich mit einem bestehenden Wartungsfenster fuer dieses Projekt");
  }
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "MAINTENANCE_CREATED",
    category: "MAINTENANCE",
    projectId: window.projectId,
    message: `Wartungsfenster erstellt: ${window.reason}`,
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.status(201).json(window);
});

// Phase 28 Auftragspunkt 4 "geplante Auswirkungen muessen erkannt werden
// koennen" - siehe Kommentar an listSuppressedFailuresForWindow().
maintenanceRouter.get("/maintenance/:id/impact", authenticate, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Wartungsfenster-ID" });
    return;
  }
  const window = await getMaintenanceWindowById(id);
  if (!window) {
    throw notFoundError("Wartungsfenster nicht gefunden");
  }
  const suppressedFailures = await listSuppressedFailuresForWindow(window);
  res.json({ window, suppressedFailures });
});

maintenanceRouter.delete("/maintenance/:id", authenticate, authorizeRole(MANAGE_ROLES, resolveProjectIdFromWindowParam), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Wartungsfenster-ID" });
    return;
  }

  const before = await getMaintenanceWindowById(id);
  const deleted = await deleteMaintenanceWindow(id);
  if (!deleted) {
    res.status(404).json({ error: "Wartungsfenster nicht gefunden" });
    return;
  }
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "MAINTENANCE_DELETED",
    category: "MAINTENANCE",
    ...(before?.projectId ? { projectId: before.projectId } : {}),
    message: `Wartungsfenster geloescht: ${before?.reason ?? id}`,
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.status(204).end();
});
