import { logger } from "../../core/logger";
import { NTFY_TOPIC, sendNtfyNotification } from "../ntfy-transport";
import type { NotificationChannel, NotificationResult } from "../channel.interface";
import type { NotificationPayload } from "../notification.types";

function buildTitle(payload: NotificationPayload): string {
  return `${payload.projectName} ist OFFLINE`;
}

function buildMessage(payload: NotificationPayload): string {
  return [
    `Fehler: ${payload.error}`,
    payload.responseTimeMs !== undefined ? `Antwortzeit: ${payload.responseTimeMs}ms` : undefined,
    `Ursache: ${payload.analysis.rootCause}`,
    `Empfehlung: ${payload.analysis.recommendation}`,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

// Echte Zustellung an die ntfy-App auf dem Handy (siehe ntfy-transport.ts).
// Ein Check-Ausfall ist immer dringend genug fuer die hoechste Prioritaet -
// dieser Kanal wird ausschliesslich fuer Offline-Ereignisse aufgerufen
// (notification.service.ts::notifyOffline), es gibt hier keine niedrigeren
// Schweregrade abzustufen (anders als event-channels/push-event.channel.ts).
export const pushChannel: NotificationChannel = {
  name: "push",

  async send(payload: NotificationPayload): Promise<NotificationResult> {
    if (!NTFY_TOPIC) {
      logger.warn("Push-Benachrichtigung uebersprungen - ntfy nicht konfiguriert", { project: payload.projectId });
      return { channel: "push", status: "FAILED", error: "ntfy nicht konfiguriert" };
    }

    try {
      await sendNtfyNotification({ title: buildTitle(payload), message: buildMessage(payload), priority: 5, tags: ["rotating_light"] });
      return { channel: "push", status: "SENT" };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unbekannter Fehler";
      logger.error("Push-Benachrichtigung fehlgeschlagen", { project: payload.projectId, error: message });
      return { channel: "push", status: "FAILED", error: message };
    }
  },
};
