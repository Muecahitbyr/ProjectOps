// Spiegelt src/types/webhook.types.ts im Backend.
//
// Phase 27 "Enterprise Deployment Tracking & Change Correlation" -
// echter, gefundener Bug (live bestaetigt: das "New Webhook"-Formular
// konnte bis dahin nur aus 12 Event-Typen waehlen, obwohl das Backend seit
// Phase 16/19/21 bereits 10 weitere real dispatcht - API_KEY_CREATED/
// REVOKED/ROTATED, API_QUOTA_WARNING/EXCEEDED, API_USAGE_THRESHOLD_WARNING/
// SPIKE_DETECTED, INCIDENT_ACKNOWLEDGED/REOPENED waren fuer Organisationen
// im UI schlicht nicht abonnierbar). Exakt dieselbe Bugklasse wie bei
// ApiScope (siehe dortigen Kommentar in api-scope.types.ts, Phase 18/24) -
// jetzt vollstaendig mit dem Backend synchronisiert.
export type WebhookEventType =
  | "INCIDENT_CREATED"
  | "INCIDENT_RESOLVED"
  | "ALERT_TRIGGERED"
  | "ALERT_ESCALATED"
  | "AUTOMATION_FINISHED"
  | "AUTOMATION_FAILED"
  | "NOTIFICATION_EVENT"
  | "FAILOVER_STARTED"
  | "FAILOVER_FINISHED"
  | "FORECAST_UPDATED"
  | "AGENT_ONLINE"
  | "AGENT_OFFLINE"
  | "API_KEY_CREATED"
  | "API_KEY_REVOKED"
  | "API_QUOTA_WARNING"
  | "API_QUOTA_EXCEEDED"
  | "API_KEY_ROTATED"
  | "API_USAGE_THRESHOLD_WARNING"
  | "API_USAGE_SPIKE_DETECTED"
  | "INCIDENT_ACKNOWLEDGED"
  | "INCIDENT_REOPENED"
  | "DEPLOYMENT_CREATED"
  // Phase 39 "Enterprise Resilience External API & Webhook Integration" -
  // derselbe Sync-Schritt wie oben, um die dort beschriebene Bugklasse
  // nicht zu wiederholen.
  | "RESILIENCE_STATUS_CHANGED"
  // Phase 49 "Enterprise Risk Forecasting & Proactive Operations
  // Intelligence" - echter, bei Phase 55's Bestandsanalyse gefundener
  // Nachzuegler derselben Bugklasse (fehlte hier, obwohl seit Phase 49 real
  // dispatcht) - jetzt nachgetragen.
  | "PROACTIVE_RISK_CHANGED"
  // Phase 55 "Enterprise Capacity & Resource Optimization".
  | "AGENT_CAPACITY_CHANGED";

export const WEBHOOK_EVENT_TYPES: WebhookEventType[] = [
  "INCIDENT_CREATED",
  "INCIDENT_RESOLVED",
  "ALERT_TRIGGERED",
  "ALERT_ESCALATED",
  "AUTOMATION_FINISHED",
  "AUTOMATION_FAILED",
  "NOTIFICATION_EVENT",
  "FAILOVER_STARTED",
  "FAILOVER_FINISHED",
  "FORECAST_UPDATED",
  "AGENT_ONLINE",
  "AGENT_OFFLINE",
  "API_KEY_CREATED",
  "API_KEY_REVOKED",
  "API_QUOTA_WARNING",
  "API_QUOTA_EXCEEDED",
  "API_KEY_ROTATED",
  "API_USAGE_THRESHOLD_WARNING",
  "API_USAGE_SPIKE_DETECTED",
  "INCIDENT_ACKNOWLEDGED",
  "INCIDENT_REOPENED",
  "DEPLOYMENT_CREATED",
  "RESILIENCE_STATUS_CHANGED",
  "PROACTIVE_RISK_CHANGED",
  "AGENT_CAPACITY_CHANGED",
];

export interface Webhook {
  id: string;
  organizationId: string;
  url: string;
  events: WebhookEventType[];
  enabled: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWebhookResult {
  webhook: Webhook;
  plaintextSecret: string;
}

export type WebhookDeliveryStatus = "PENDING" | "DELIVERED" | "FAILED" | "DEAD_LETTER";

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  eventType: string;
  status: WebhookDeliveryStatus;
  attemptCount: number;
  nextAttemptAt: string;
  lastError: string | null;
  responseStatus: number | null;
  deliveredAt: string | null;
  createdAt: string;
}
