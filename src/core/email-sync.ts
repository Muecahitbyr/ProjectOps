import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { logger } from "./logger";
import { insertEmailIfNew } from "../db/emails.repository";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";

// Postfach-Panel unter KI-Buero (Nutzeranfrage: "meine E-Mails sehen, wenn
// neue dazu kommen") - IMAP mit App-Passwort statt OAuth (Nutzerentscheidung:
// funktioniert mit Gmail/Outlook/eigener Domain ohne eigenes OAuth-Consent-
// Projekt). Rein lesend: kein Senden, Loeschen, Verschieben, kein Schreiben
// zurueck ins Postfach (auch \Seen wird nicht gesetzt) - "gelesen" wird nur
// lokal in der emails-Tabelle nachgehalten (siehe emails.routes.ts).
const IMAP_HOST = process.env.IMAP_HOST;
const IMAP_PORT = process.env.IMAP_PORT ? Number(process.env.IMAP_PORT) : 993;
const IMAP_USER = process.env.IMAP_USER;
const IMAP_PASSWORD = process.env.IMAP_PASSWORD;
const IMAP_TLS = process.env.IMAP_TLS !== "false";

// Anzahl der zuletzt eingegangenen Nachrichten, die pro Durchlauf geprueft
// werden - bewusst ein fester UID-Bereich statt eines IMAP-SINCE-Suchfilters
// (SINCE hat nur Tages-, keine Zeitgranularitaet und waere fuer ein enges
// Polling-Intervall ungeeignet). Das UNIQUE-Constraint auf message_id
// (Migration 0066) macht wiederholtes Pruefen derselben Nachrichten
// ungefaehrlich - insertEmailIfNew() ist ein no-op fuer bereits bekannte
// Mails.
const CHECK_LAST_N_MESSAGES = 30;

function isConfigured(): boolean {
  return Boolean(IMAP_HOST && IMAP_USER && IMAP_PASSWORD);
}

async function syncOnce(): Promise<void> {
  const client = new ImapFlow({
    host: IMAP_HOST!,
    port: IMAP_PORT,
    secure: IMAP_TLS,
    auth: { user: IMAP_USER!, pass: IMAP_PASSWORD! },
    logger: false,
  });

  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const exists = client.mailbox && "exists" in client.mailbox ? client.mailbox.exists : 0;
      if (!exists) return;

      const from = Math.max(1, exists - CHECK_LAST_N_MESSAGES + 1);
      const range = `${from}:${exists}`;

      for await (const message of client.fetch(range, { envelope: true, source: true })) {
        if (!message.source) continue;
        const parsed = await simpleParser(message.source);
        const fromAddress = parsed.from?.value[0]?.address ?? message.envelope?.from?.[0]?.address ?? "unbekannt";
        const fromName = parsed.from?.value[0]?.name ?? message.envelope?.from?.[0]?.name ?? null;
        const messageId = parsed.messageId ?? `${message.uid}@${IMAP_HOST}`;
        const snippet = parsed.text ? parsed.text.trim().slice(0, 240) : null;

        const inserted = await insertEmailIfNew({
          messageId,
          fromAddress,
          fromName,
          subject: parsed.subject ?? message.envelope?.subject ?? null,
          snippet,
          receivedAt: (parsed.date ?? message.envelope?.date ?? new Date()).toISOString(),
        });

        if (inserted) {
          broadcast(createEvent(RealtimeEventType.EMAIL_RECEIVED, inserted));
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => client.close());
  }
}

let intervalHandle: ReturnType<typeof setInterval> | undefined;

export function startEmailSync(intervalMs: number): void {
  if (!isConfigured()) {
    logger.warn("E-Mail-Sync uebersprungen - IMAP nicht konfiguriert (IMAP_HOST/IMAP_USER/IMAP_PASSWORD fehlen)");
    return;
  }

  const tick = () => {
    void syncOnce().catch((err) => {
      const message = err instanceof Error ? err.message : "Unbekannter Fehler";
      logger.error("E-Mail-Sync fehlgeschlagen", { error: message });
    });
  };

  tick();
  intervalHandle = setInterval(tick, intervalMs);
  logger.info("E-Mail-Sync gestartet", { intervalMs });
}

export function stopEmailSync(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = undefined;
  }
}
