// Gemeinsam von channels/push.channel.ts (Offline-Benachrichtigung mit KI-
// Analyse) und event-channels/push-event.channel.ts (Alert/Wartung/Root-
// Incident) genutzt, damit die ntfy-Konfiguration nur an einer Stelle
// gelesen wird - analog zu smtp-transport.ts fuer E-Mail. ntfy.sh (oder ein
// selbst gehosteter ntfy-Server ueber NTFY_BASE_URL) liefert echte Push-
// Benachrichtigungen an die ntfy-App auf dem Handy, ganz ohne eigenes APNs-
// Zertifikat/eigene iOS-App - das Topic wirkt als geteiltes Geheimnis (siehe
// .env.production.example).
export const NTFY_TOPIC = process.env.NTFY_TOPIC;
const NTFY_BASE_URL = process.env.NTFY_BASE_URL ?? "https://ntfy.sh";

// 1 (min) bis 5 (urgent) - ntfy's eigene Priority-Skala, siehe
// https://docs.ntfy.sh/publish/#message-priority.
export type NtfyPriority = 1 | 2 | 3 | 4 | 5;

interface NtfyNotificationInput {
  title: string;
  message: string;
  priority: NtfyPriority;
  tags?: string[];
}

// JSON-Publish-Endpunkt (statt Header-basiertem Publish) bewusst gewaehlt -
// Titel/Nachricht enthalten deutsche Umlaute, die in HTTP-Headern erst
// URL-kodiert werden muessten; im JSON-Body ist das kein Thema. Siehe
// https://docs.ntfy.sh/publish/#publish-as-json.
export async function sendNtfyNotification(input: NtfyNotificationInput): Promise<void> {
  if (!NTFY_TOPIC) {
    throw new Error("ntfy nicht konfiguriert (NTFY_TOPIC fehlt)");
  }

  const response = await fetch(NTFY_BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: NTFY_TOPIC,
      title: input.title,
      message: input.message,
      priority: input.priority,
      ...(input.tags ? { tags: input.tags } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`ntfy antwortete mit HTTP ${response.status}`);
  }
}
