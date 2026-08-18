import { logger } from "../../core/logger";
import { ALERT_EMAIL_TO, createSmtpTransporter, SMTP_FROM } from "../smtp-transport";
import type { EventChannelResult, NotificationEventChannel } from "../event-channel.interface";
import type { NotificationEvent } from "../notification-event.types";

function buildSubject(event: NotificationEvent): string {
  return `[ProjectOps] ${event.projectName}: ${event.title}`;
}

function buildText(event: NotificationEvent): string {
  return [
    `Projekt: ${event.projectName}`,
    `Schweregrad: ${event.severity}`,
    `Zeitpunkt: ${event.timestamp}`,
    "",
    event.message,
  ].join("\n");
}

export const emailEventChannel: NotificationEventChannel = {
  name: "EMAIL",

  async send(event: NotificationEvent): Promise<EventChannelResult> {
    const transporter = createSmtpTransporter();
    const to = ALERT_EMAIL_TO;

    if (!transporter || !to) {
      logger.warn("E-Mail-Event-Benachrichtigung uebersprungen - SMTP nicht konfiguriert", {
        project: event.projectId,
        type: event.type,
      });
      return { channel: "EMAIL", status: "FAILED", error: "SMTP nicht konfiguriert" };
    }

    try {
      await transporter.sendMail({ from: SMTP_FROM, to, subject: buildSubject(event), text: buildText(event) });
      return { channel: "EMAIL", status: "SENT" };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unbekannter Fehler";
      logger.error("E-Mail-Event-Benachrichtigung fehlgeschlagen", { project: event.projectId, error: message });
      return { channel: "EMAIL", status: "FAILED", error: message };
    }
  },
};
