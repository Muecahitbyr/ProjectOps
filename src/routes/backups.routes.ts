import { Router } from "express";
import { z } from "zod";
import { captureSystemBackup, restoreSystemBackup } from "../backup/backup-service";
import { getSystemBackupById, listSystemBackups } from "../db/system-backups.repository";
import { authenticate } from "../middleware/authenticate";
import { authorizeGlobalAdmin } from "../middleware/authorize";
import { notFoundError } from "../core/app-error";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";
import { recordAuditLog } from "../core/audit-log";

// Phase 13 Teil 8 "Backup Center" - kein Shell-Aufruf, keine externen
// Tools: die gesamte Logik liegt in backup/backup-service.ts (bestehende
// Repository-Funktionen). Nur OWNER/ADMIN duerfen sichern/wiederherstellen -
// ein Backup enthaelt projektuebergreifende Konfigurationsdaten.
export const backupsRouter = Router();

backupsRouter.get("/backups", authenticate, authorizeGlobalAdmin(), async (_req, res) => {
  res.json(await listSystemBackups());
});

backupsRouter.get("/backups/:id", authenticate, authorizeGlobalAdmin(), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Backup-ID" });
    return;
  }
  const backup = await getSystemBackupById(id);
  if (!backup) {
    throw notFoundError("Backup nicht gefunden");
  }
  res.json(backup);
});

const createSchema = z.object({ label: z.string().trim().min(1).max(200) });

backupsRouter.post("/backups", authenticate, authorizeGlobalAdmin(), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }

  const backup = await captureSystemBackup(parsed.data.label, req.userId);
  broadcast(createEvent(RealtimeEventType.BACKUP_STARTED, { backupId: backup.id, label: backup.label }));
  broadcast(createEvent(RealtimeEventType.BACKUP_FINISHED, backup));
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "BACKUP_CREATED",
    category: "BACKUP",
    message: `Backup "${backup.label}" erstellt`,
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.status(201).json(backup);
});

backupsRouter.post("/backups/:id/restore", authenticate, authorizeGlobalAdmin(), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Backup-ID" });
    return;
  }
  if (!req.userId) {
    throw notFoundError("Backup nicht gefunden");
  }

  broadcast(createEvent(RealtimeEventType.RESTORE_STARTED, { backupId: id }));
  const summary = await restoreSystemBackup(id, req.userId);
  broadcast(createEvent(RealtimeEventType.RESTORE_FINISHED, { backupId: id, restoredAt: new Date().toISOString() }));
  void recordAuditLog({
    userId: req.userId,
    action: "BACKUP_RESTORED",
    category: "BACKUP",
    message: `Backup #${id} wiederhergestellt (${summary.alertRulesRestored} Alert-Regeln, ${summary.automationRulesRestored} Automation-Regeln, ${summary.maintenanceWindowsRestored} Wartungsfenster, ${summary.notificationSettingsRestored} Benachrichtigungseinstellungen)`,
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.json(summary);
});
