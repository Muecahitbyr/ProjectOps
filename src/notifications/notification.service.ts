import { logger } from "../core/logger";
import { recordNotification } from "../db/notifications.repository";
import { addTimelineEvent } from "../db/incident-timeline.repository";
import { emailChannel } from "./channels/email.channel";
import { pushChannel } from "./channels/push.channel";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";
import type { NotificationChannel, NotificationResult } from "./channel.interface";
import type { NotificationPayload } from "./notification.types";

// Weitere Kanaele (z.B. Slack) werden hier einfach ergaenzt.
const channels: NotificationChannel[] = [emailChannel, pushChannel];

function broadcastNotificationSent(
  payload: NotificationPayload,
  result: NotificationResult,
  incidentId: number | undefined,
): void {
  broadcast(
    createEvent(RealtimeEventType.NOTIFICATION_SENT, {
      projectId: payload.projectId,
      checkId: payload.checkId,
      incidentId: incidentId ?? null,
      channel: result.channel,
      status: result.status,
      ...(result.error ? { error: result.error } : {}),
    }),
  );
}

// Phase 21 Auftragspunkt 4 "Incident Timeline" - EIN zusaetzlicher, kleiner
// Eintrag pro Kanal, NUR wenn diese Benachrichtigung tatsaechlich zu einem
// Incident gehoert (incidentId gesetzt) - keine doppelte Datenhaltung: die
// vollstaendigen Zustelldetails bleiben weiterhin in notifications
// (db/notifications.repository.ts), hier nur ein kurzer, fuer die
// Incident-Erzaehlung lesbarer Hinweis.
function recordTimelineNotification(incidentId: number | undefined, result: NotificationResult): void {
  if (incidentId === undefined) return;
  void addTimelineEvent({
    incidentId,
    eventType: "NOTIFICATION_SENT",
    message: `Benachrichtigung ueber ${result.channel} ${result.status === "SENT" ? "gesendet" : result.status === "PENDING" ? "vorbereitet" : "fehlgeschlagen"}`,
    metadata: { channel: result.channel, status: result.status },
  });
}

export async function notifyOffline(payload: NotificationPayload, incidentId?: number): Promise<void> {
  for (const channel of channels) {
    try {
      const result = await channel.send(payload);
      await recordNotification(payload, result, incidentId);
      broadcastNotificationSent(payload, result, incidentId);
      recordTimelineNotification(incidentId, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unbekannter Fehler";
      logger.error("Benachrichtigungskanal fehlgeschlagen", { channel: channel.name, error: message });
      const result: NotificationResult = { channel: channel.name, status: "FAILED", error: message };
      await recordNotification(payload, result, incidentId);
      broadcastNotificationSent(payload, result, incidentId);
      recordTimelineNotification(incidentId, result);
    }
  }
}
