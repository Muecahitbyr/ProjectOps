import type { IncidentSeverity } from "./common.types";

// Hinweis: Postgres BIGSERIAL-IDs werden vom pg-Treiber als String
// serialisiert (Praezisionsschutz), daher "id: string" statt "number" -
// entspricht der tatsaechlichen JSON-Antwort, nicht der internen
// Backend-Typisierung.
export interface Incident {
  id: string;
  projectId: string;
  checkId: string;
  severity: IncidentSeverity;
  title: string;
  description: string | null;
  resolved: boolean;
  createdAt: string;
  resolvedAt: string | null;
  // Phase 21 "Enterprise Alerting, Incident Response & Notification
  // Orchestration" Auftragspunkt 3 "Incident Lifecycle".
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  assigneeId: string | null;
  resolutionReason: string | null;
  // Phase 27 "Enterprise On-Call & Escalation Management" - id: number (nicht
  // string wie oben bei Incident.id) - das Backend konvertiert diese
  // BIGINT-Spalte explizit per Number(), siehe db/incidents.repository.ts.
  escalationPolicyId: number | null;
  lastEscalatedStep: number;
}

// Spiegelt deriveIncidentStatus() im Backend (types/incident.types.ts) -
// reine Ableitung, keine eigene gespeicherte Spalte. RESOLVED hat Vorrang
// vor ACKNOWLEDGED.
export type IncidentStatus = "OPEN" | "ACKNOWLEDGED" | "RESOLVED";

export function deriveIncidentStatus(incident: Pick<Incident, "resolvedAt" | "acknowledgedAt">): IncidentStatus {
  if (incident.resolvedAt !== null) return "RESOLVED";
  if (incident.acknowledgedAt !== null) return "ACKNOWLEDGED";
  return "OPEN";
}

export type IncidentTimelineEventType =
  | "CREATED"
  | "ALERT_TRIGGERED"
  | "NOTIFICATION_SENT"
  | "ACKNOWLEDGED"
  | "AUTOMATION_STARTED"
  | "AUTOMATION_SUCCEEDED"
  | "AUTOMATION_FAILED"
  | "RESOLVED"
  | "REOPENED"
  | "COMMENTED"
  | "ASSIGNED"
  | "COMMAND_UPDATED";

export interface IncidentTimelineEvent {
  id: string;
  incidentId: string;
  eventType: IncidentTimelineEventType;
  message: string;
  metadata: Record<string, unknown> | null;
  actorUserId: string | null;
  createdAt: string;
}
