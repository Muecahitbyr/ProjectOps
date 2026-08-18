// Phase 31 "Enterprise Change/Incident Communication & Stakeholder
// Notification Intelligence". target_type mirrort EscalationTargetType
// (escalation-policy.types.ts) plus "GENERAL" (keine konkrete Zielperson -
// siehe Migration 0054 fuer die Begruendung).
export type CommunicationTargetType = "USER" | "ON_CALL_SCHEDULE" | "GENERAL";
export const COMMUNICATION_TARGET_TYPES: CommunicationTargetType[] = ["USER", "ON_CALL_SCHEDULE", "GENERAL"];

// Dieselbe Skala wie NotificationEventSeverity (notifications/notification-event.types.ts) -
// bewusst NICHT die Incident-Severity-Skala (LOW/MEDIUM/HIGH/CRITICAL), da
// eine Communication ihre eigene Dringlichkeit unabhaengig vom Incident hat.
export type CommunicationSeverity = "INFO" | "WARNING" | "HIGH" | "CRITICAL";
export const COMMUNICATION_SEVERITIES: CommunicationSeverity[] = ["INFO", "WARNING", "HIGH", "CRITICAL"];

export const NOTIFICATION_CHANNEL_IDS = ["EMAIL", "PUSH", "IN_APP", "WEBSOCKET"] as const;
export type NotificationChannelId = (typeof NOTIFICATION_CHANNEL_IDS)[number];

export interface IncidentCommunication {
  id: number;
  incidentId: number;
  message: string;
  severity: CommunicationSeverity;
  targetType: CommunicationTargetType;
  targetUserId: string | null;
  targetScheduleId: number | null;
  notificationChannelId: NotificationChannelId | null;
  createdBy: string | null;
  createdAt: string;
}

// Auftragspunkt 6 "Communication Safety".
export type CommunicationSafetyVerdict = "READY" | "BLOCKED" | "COOLDOWN" | "ALREADY_SENT" | "INVALID_TARGET";

export interface CommunicationSafetyResult {
  verdict: CommunicationSafetyVerdict;
  reason: string | null;
}

// Auftragspunkt 5 "Automatische Communication Suggestions" - reine
// Vorschlaege, niemals automatisch versendet (siehe core/incident-
// communication.ts).
export type CommunicationRecommendationKey =
  | "INCIDENT_CREATED"
  | "INCIDENT_ESCALATED"
  | "INCIDENT_ACKNOWLEDGED"
  | "INCIDENT_RESOLVED"
  | "LONG_RUNNING"
  | "CRITICAL_SERVICE"
  | "LARGE_BLAST_RADIUS"
  | "RECOVERY_SUCCEEDED"
  | "RECOVERY_FAILED"
  | "CHANGE_CORRELATION"
  | "DEPLOYMENT_CORRELATION";

export interface CommunicationRecommendation {
  key: CommunicationRecommendationKey;
  severity: CommunicationSeverity;
  title: string;
  message: string;
  reason: string;
}
