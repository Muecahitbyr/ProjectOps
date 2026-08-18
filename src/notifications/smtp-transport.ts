import nodemailer, { type Transporter } from "nodemailer";

// Gemeinsam von channels/email.channel.ts (Offline-Benachrichtigung mit
// KI-Analyse) und event-channels/email-event.channel.ts (Phase 10, Alert/
// Wartung/Root-Incident) genutzt, damit die SMTP-Konfiguration nur an einer
// Stelle gelesen wird.
export function createSmtpTransporter(): Transporter | undefined {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;

  if (!host || !port) {
    return undefined;
  }

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  return nodemailer.createTransport({
    host,
    port: Number(port),
    secure: Number(port) === 465,
    ...(user && pass ? { auth: { user, pass } } : {}),
  });
}

export const SMTP_FROM = process.env.SMTP_FROM ?? "ProjectOps <noreply@projectops.local>";
export const ALERT_EMAIL_TO = process.env.ALERT_EMAIL_TO;
