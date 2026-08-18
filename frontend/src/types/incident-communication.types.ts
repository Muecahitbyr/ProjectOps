// Phase 31 "Enterprise Change/Incident Communication & Stakeholder
// Notification Intelligence" - spiegelt src/types/incident-communication.types.ts.
export type CommunicationTargetType = "USER" | "ON_CALL_SCHEDULE" | "GENERAL";
export type CommunicationSeverity = "INFO" | "WARNING" | "HIGH" | "CRITICAL";
export const COMMUNICATION_SEVERITIES: CommunicationSeverity[] = ["INFO", "WARNING", "HIGH", "CRITICAL"];
export const NOTIFICATION_CHANNEL_IDS = ["EMAIL", "PUSH", "IN_APP", "WEBSOCKET"] as const;
export type NotificationChannelId = (typeof NOTIFICATION_CHANNEL_IDS)[number];

export interface IncidentCommunication {
  id: string;
  incidentId: string;
  message: string;
  severity: CommunicationSeverity;
  targetType: CommunicationTargetType;
  targetUserId: string | null;
  targetScheduleId: string | null;
  notificationChannelId: NotificationChannelId | null;
  createdBy: string | null;
  createdAt: string;
}

export type CommunicationSafetyVerdict = "READY" | "BLOCKED" | "COOLDOWN" | "ALREADY_SENT" | "INVALID_TARGET";

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

export interface IncidentCommunicationsResponse {
  communications: IncidentCommunication[];
  recommendations: CommunicationRecommendation[];
}

export interface CreateIncidentCommunicationInput {
  message: string;
  severity: CommunicationSeverity;
  targetUserId?: string;
  targetScheduleId?: number;
  notificationChannelId?: NotificationChannelId;
}
