import { logger } from "../../core/logger";
import { NTFY_TOPIC, sendNtfyNotification } from "../ntfy-transport";
import type { EventChannelResult, NotificationEventChannel } from "../event-channel.interface";
import type { NotificationEvent, NotificationEventSeverity } from "../notification-event.types";

// notification-policy.config.ts leitet ohnehin nur CRITICAL-Events an PUSH
// weiter - die Abstufung existiert trotzdem vollstaendig (statt hart auf 5
// zu setzen), falls die Policy spaeter mal HIGH/WARNING mit einschliesst.
const PRIORITY_BY_SEVERITY: Record<NotificationEventSeverity, 1 | 2 | 3 | 4 | 5> = {
  CRITICAL: 5,
  HIGH: 4,
  WARNING: 3,
  INFO: 2,
};

function buildMessage(event: NotificationEvent): string {
  return [`Projekt: ${event.projectName}`, `Schweregrad: ${event.severity}`, "", event.message].join("\n");
}

// Echte Zustellung an die ntfy-App auf dem Handy (siehe ntfy-transport.ts) -
// deckt Alert-Ausloesung/-Eskalation, Wartungsfenster, Root-Incidents,
// Incident-Eskalation, Resilience-Statuswechsel und proaktive Risiko-
// Erkennung ab (siehe notification-event.service.ts fuer alle Aufrufer).
export const pushEventChannel: NotificationEventChannel = {
  name: "PUSH",

  async send(event: NotificationEvent): Promise<EventChannelResult> {
    if (!NTFY_TOPIC) {
      logger.warn("Push-Event-Benachrichtigung uebersprungen - ntfy nicht konfiguriert", { project: event.projectId, type: event.type });
      return { channel: "PUSH", status: "FAILED", error: "ntfy nicht konfiguriert" };
    }

    try {
      await sendNtfyNotification({
        title: `${event.projectName}: ${event.title}`,
        message: buildMessage(event),
        priority: PRIORITY_BY_SEVERITY[event.severity],
        tags: ["rotating_light"],
      });
      return { channel: "PUSH", status: "SENT" };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unbekannter Fehler";
      logger.error("Push-Event-Benachrichtigung fehlgeschlagen", { project: event.projectId, type: event.type, error: message });
      return { channel: "PUSH", status: "FAILED", error: message };
    }
  },
};
