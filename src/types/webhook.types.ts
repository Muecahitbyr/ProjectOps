// Phase 15 Teil 7 "Webhooks" - jeder unterstuetzte Event-Typ entspricht
// einem bereits realen internen Realtime-Event (siehe realtime/events.ts,
// Phase 9-14), nur zusaetzlich per signiertem HTTP POST nach aussen
// zugestellt statt (nur) ueber WebSocket. Keine erfundene zweite
// Event-Taxonomie.
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
  // Phase 16 "Enterprise API Platform" - API_KEY_CREATED/REVOKED existierten
  // bereits als RealtimeEventType (Phase 15), waren aber noch nicht Teil
  // der Webhook-Taxonomie. API_QUOTA_WARNING/EXCEEDED sind neu (siehe
  // realtime/events.ts).
  | "API_KEY_CREATED"
  | "API_KEY_REVOKED"
  | "API_QUOTA_WARNING"
  | "API_QUOTA_EXCEEDED"
  // Phase 16 (2. Iteration) - API_KEY_ROTATED begleitet die neue "Rotate"-
  // Aktion, gleiches Prinzip wie API_KEY_CREATED/REVOKED. API_KEY_EXPIRED/
  // API_USAGE_UPDATED sind bewusst NICHT Teil der Webhook-Taxonomie: ersteres
  // ist bereits ueber den fehlgeschlagenen eigenen API-Aufruf des
  // Konsumenten sichtbar, zweites waere bei Drosselung auf 1x/5s pro
  // Organisation immer noch zu hochfrequent fuer sinnvolle Webhook-Zustellung.
  | "API_KEY_ROTATED"
  // Phase 19 "Enterprise Observability, API Analytics & Operational
  // Intelligence" - echte, hysteresegesteuerte Operational-Intelligence-
  // Warnungen (siehe realtime/events.ts), analog zu API_QUOTA_WARNING/
  // EXCEEDED bewusst Teil der Webhook-Taxonomie (selten genug, um keinen
  // Zustellungs-Spam zu erzeugen).
  | "API_USAGE_THRESHOLD_WARNING"
  | "API_USAGE_SPIKE_DETECTED"
  // Phase 21 "Enterprise Alerting, Incident Response & Notification
  // Orchestration" - Gegenstuecke zu den bestehenden INCIDENT_CREATED/
  // RESOLVED, dieselbe Bedeutung fuer externe Integratoren. INCIDENT_
  // UPDATED bewusst NICHT Teil der Webhook-Taxonomie (zu generisch/
  // haeufig fuer sinnvolle Zustellung, gleiche Begruendung wie API_USAGE_
  // UPDATED oben).
  | "INCIDENT_ACKNOWLEDGED"
  | "INCIDENT_REOPENED"
  // Phase 27 "Enterprise Deployment Tracking & Change Correlation" - der
  // primaere reale Anwendungsfall dieser Phase ist gerade ein externes
  // CI/CD-System: DEPLOYMENT_CREATED erlaubt Integrationen (z.B. ein
  // Slack-Bot), auf jedes gemeldete Deployment zu reagieren.
  | "DEPLOYMENT_CREATED"
  // Phase 39 "Enterprise Resilience External API & Webhook Integration" -
  // Gegenstueck zu RealtimeEventType.RESILIENCE_STATUS_CHANGED (Phase 38),
  // EIN Event fuer beide Richtungen (previousStatus/newStatus stehen bereits
  // im Payload) statt zweier separater Typen - anders als z.B. INCIDENT_
  // CREATED/RESOLVED gibt es hier keine zwei unterschiedlich geformten
  // Nutzlasten, nur einen Statusuebergang. Selten genug (in-memory
  // Hysterese, nur bei echten Uebergaengen), um keinen Zustellungs-Spam zu
  // erzeugen - dieselbe Begruendung wie API_USAGE_THRESHOLD_WARNING/
  // SPIKE_DETECTED oben.
  | "RESILIENCE_STATUS_CHANGED"
  // Phase 49 "Enterprise Risk Forecasting & Proactive Operations
  // Intelligence" - Gegenstueck zu RESILIENCE_STATUS_CHANGED, aber fuer
  // core/proactive-risk-alerting.ts's Hysterese (Capacity-Watchlist-
  // basierte Fruehwarnung statt eines bereits eingetretenen Status-
  // uebergangs). EIN Event fuer beide Richtungen (state="DETECTED"|
  // "CLEARED" steht im Payload), dieselbe Begruendung wie
  // RESILIENCE_STATUS_CHANGED oben.
  | "PROACTIVE_RISK_CHANGED"
  // Phase 55 "Enterprise Capacity & Resource Optimization" - Gegenstueck zu
  // PROACTIVE_RISK_CHANGED, aber fuer core/local-agent.ts#evaluateAgentCapacityIfDue()'s
  // Hysterese (Agent-Disk-/Memory-Kapazitaetsprognose statt eines Projekt-
  // Forecast-Signals). EIN Event fuer beide Richtungen (state="AT_RISK"|
  // "RECOVERED" steht im Payload), dieselbe Begruendung wie
  // PROACTIVE_RISK_CHANGED oben.
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

export interface CreateWebhookInput {
  organizationId: string;
  url: string;
  events: WebhookEventType[];
  createdBy?: string;
}

export interface CreateWebhookResult {
  webhook: Webhook;
  plaintextSecret: string;
}

export type WebhookDeliveryStatus = "PENDING" | "DELIVERED" | "FAILED" | "DEAD_LETTER";

export interface WebhookDelivery {
  id: number;
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
