import { createAuditLogEntry, type CreateAuditLogInput } from "../db/audit-log.repository";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";
import { logger } from "./logger";

// Phase 13 Teil 7 "Audit Center" - duenner Wrapper, additiv aus bestehenden
// Routen aufgerufen (Login, Alert-CRUD, Automation-Freigabe, ...). Ein
// fehlschlagendes Audit-Log darf NIE die eigentliche Aktion verhindern -
// Fehler werden geloggt, nicht geworfen.
export async function recordAuditLog(input: CreateAuditLogInput): Promise<void> {
  try {
    const entry = await createAuditLogEntry(input);
    broadcast(createEvent(RealtimeEventType.AUDIT_CREATED, entry));
  } catch (err) {
    logger.error("Audit-Log konnte nicht gespeichert werden", {
      action: input.action,
      error: err instanceof Error ? err.message : "Unbekannter Fehler",
    });
  }
}
