import { logger } from "../core/logger";
import { recordNotificationEvent, countNotificationEventsForProjectOrgSince } from "../db/notification-events.repository";
import { getProjectOrganizationId } from "../db/projects.repository";
import { channelsForSeverity, MAX_NOTIFICATIONS_PER_ORGANIZATION_PER_HOUR } from "../config/notification-policy.config";
import { emailEventChannel } from "./event-channels/email-event.channel";
import { pushEventChannel } from "./event-channels/push-event.channel";
import { inAppEventChannel } from "./event-channels/in-app-event.channel";
import { websocketEventChannel } from "./event-channels/websocket-event.channel";
import type { NotificationEventChannel } from "./event-channel.interface";
import type { NotificationEvent } from "./notification-event.types";

const channels: NotificationEventChannel[] = [emailEventChannel, pushEventChannel, inAppEventChannel, websocketEventChannel];

// Zentraler Versandpunkt fuer Auftragspunkt 3 "Notification Infrastructure" -
// wird von Alert Trigger/Eskalation (alerts/alert-evaluator.ts), Wartungsfenster
// Start/Ende (core/monitor.ts) und Root-Incidents (incidents/incident-correlation.ts)
// aufgerufen. Ein fehlschlagender Kanal darf die anderen nicht verhindern -
// dieselbe Fehlerisolierung wie in notification.service.ts (notifyOffline).
//
// Phase 21 Auftragspunkt 6/7/18 "Notification Policies"/"Storm Protection"/
// "Notification Quotas" - zwei zusaetzliche Schritte VOR dem eigentlichen
// Versand: (1) nur die fuer diesen Schweregrad konfigurierten Kanaele
// anschreiben (statt immer alle vier), (2) eine grobe organisationsweite
// Stundenquota als letzte Sicherung gegen einen Benachrichtigungs-Sturm, der
// trotz bestehender Alert-/Incident-Deduplizierung durch viele GLEICHZEITIG
// ausloesende, VERSCHIEDENE Regeln entstehen koennte.
export async function dispatchNotificationEvent(event: NotificationEvent): Promise<void> {
  const organizationId = await getProjectOrganizationId(event.projectId).catch(() => undefined);
  if (organizationId) {
    const recentCount = await countNotificationEventsForProjectOrgSince(organizationId, 60);
    if (recentCount >= MAX_NOTIFICATIONS_PER_ORGANIZATION_PER_HOUR) {
      logger.warn("Notification-Versand gedrosselt - Stundenquota der Organisation erreicht", {
        organizationId,
        type: event.type,
        projectId: event.projectId,
        recentCount,
        limit: MAX_NOTIFICATIONS_PER_ORGANIZATION_PER_HOUR,
      });
      return;
    }
  }

  const allowedChannels = new Set(channelsForSeverity(event.severity));
  for (const channel of channels) {
    if (!allowedChannels.has(channel.name)) continue;
    try {
      const result = await channel.send(event);
      await recordNotificationEvent(event, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unbekannter Fehler";
      logger.error("Notification-Event-Kanal fehlgeschlagen", { channel: channel.name, type: event.type, error: message });
      await recordNotificationEvent(event, { channel: channel.name, status: "FAILED", error: message });
    }
  }
}
