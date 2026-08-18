import type { NotificationEventSeverity } from "../notifications/notification-event.types";
import type { EventChannelName } from "../notifications/event-channel.interface";

// Phase 21 "Enterprise Alerting, Incident Response & Notification
// Orchestration" Auftragspunkt 6 "Notification Policies" - vorher sendete
// dispatchNotificationEvent() IMMER an alle vier Kanaele, unabhaengig vom
// Schweregrad (echte gefundene Luecke: ein reiner INFO-Hinweis loeste
// denselben Vier-Kanal-Versand aus wie ein CRITICAL-Ausfall). Konfigurierbare
// Zuordnung statt hartcodierter if/switch-Verzweigung in der Dispatch-Logik
// selbst - neue Schweregrade/Kanaele aendern nur diese Tabelle.
export const NOTIFICATION_POLICY: Record<NotificationEventSeverity, readonly EventChannelName[]> = {
  CRITICAL: ["EMAIL", "PUSH", "WEBSOCKET", "IN_APP"],
  HIGH: ["EMAIL", "WEBSOCKET", "IN_APP"],
  WARNING: ["EMAIL", "WEBSOCKET"],
  INFO: ["WEBSOCKET"],
};

export function channelsForSeverity(severity: NotificationEventSeverity): readonly EventChannelName[] {
  return NOTIFICATION_POLICY[severity];
}

// Auftragspunkt 7/18 "Cooldown/Notification Storm Protection"/"Notification
// Quotas" - organisationsweite Obergrenze pro Stunde (eigene, dokumentierte
// Annahme, keine externe Vorgabe vorhanden). Dedup/Cooldown auf Ebene "EIN
// Alert-Event/EIN Incident feuert nur einmal pro Episode" existiert bereits
// (alert_events/incidents unique-partial-Indizes) - diese Quota ist eine
// ZUSAETZLICHE, grobere Sicherung gegen den Fall, dass viele VERSCHIEDENE
// Regeln/Checks gleichzeitig ausloesen (z.B. ein Netzwerkausfall, der alle
// Projekte einer Organisation gleichzeitig betrifft).
export const MAX_NOTIFICATIONS_PER_ORGANIZATION_PER_HOUR = 200;
