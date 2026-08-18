import { logger } from "../../core/logger";
import { ALERT_EMAIL_TO, createSmtpTransporter, SMTP_FROM } from "../smtp-transport";
import type { NotificationChannel, NotificationResult } from "../channel.interface";
import type { NotificationPayload } from "../notification.types";

function buildSubject(payload: NotificationPayload): string {
  return `[ProjectOps] ${payload.projectName} ist OFFLINE`;
}

function buildText(payload: NotificationPayload): string {
  return [
    `Projekt: ${payload.projectName}`,
    `Fehler: ${payload.error}`,
    `Zeitpunkt: ${payload.timestamp}`,
    payload.responseTimeMs !== undefined ? `Antwortzeit: ${payload.responseTimeMs}ms` : undefined,
    `Zusammenfassung: ${payload.analysis.summary}`,
    `Moegliche Ursache: ${payload.analysis.rootCause}`,
    `Empfehlung: ${payload.analysis.recommendation}`,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

export const emailChannel: NotificationChannel = {
  name: "email",

  async send(payload: NotificationPayload): Promise<NotificationResult> {
    const transporter = createSmtpTransporter();
    const to = ALERT_EMAIL_TO;

    if (!transporter || !to) {
      logger.warn("E-Mail-Benachrichtigung uebersprungen - SMTP nicht konfiguriert", {
        project: payload.projectId,
      });
      return { channel: "email", status: "FAILED", error: "SMTP nicht konfiguriert" };
    }

    try {
      await transporter.sendMail({
        from: SMTP_FROM,
        to,
        subject: buildSubject(payload),
        text: buildText(payload),
      });
      return { channel: "email", status: "SENT" };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unbekannter Fehler";
      logger.error("E-Mail-Benachrichtigung fehlgeschlagen", {
        project: payload.projectId,
        error: message,
      });
      return { channel: "email", status: "FAILED", error: message };
    }
  },
};
