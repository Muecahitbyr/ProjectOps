export type IncidentSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface Incident {
  id: number;
  projectId: string;
  checkId: string;
  severity: IncidentSeverity;
  title: string;
  description: string | null;
  resolved: boolean;
  createdAt: string;
  resolvedAt: string | null;
  // Phase 21 "Enterprise Alerting, Incident Response & Notification
  // Orchestration" Auftragspunkt 3 "Incident Lifecycle" (Migration 0041).
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  assigneeId: string | null;
  resolutionReason: string | null;
  // Phase 27 "Enterprise On-Call & Escalation Management" - Snapshot der
  // beim Eroeffnen aufgeloesten Service-Policy (siehe core/monitor.ts) und
  // der zuletzt ausgefuehrten Eskalationsstufe (core/incident-escalation.ts).
  escalationPolicyId: number | null;
  lastEscalatedStep: number;
}

// Auftragspunkt 3 - "Status soll nicht redundant gespeichert werden, wenn
// er sauber aus vorhandenen Feldern abgeleitet werden kann": OPEN/
// ACKNOWLEDGED/RESOLVED ergeben sich vollstaendig aus acknowledgedAt/
// resolvedAt, dasselbe Ableitungsprinzip wie deriveApiKeyStatus() (Phase
// 20). RESOLVED hat Vorrang vor ACKNOWLEDGED (ein geloester, vorher
// bestaetigter Incident bleibt RESOLVED, nicht "ACKNOWLEDGED"). Kein
// SUPPRESSED-Status: Wartungsfenster unterdruecken die Incident-ERSTELLUNG
// bereits vollstaendig (siehe core/monitor.ts, isFailing && maintenanceWindow),
// ein bereits angelegter Incident kann daher nie "unterdrueckt" sein - ein
// eigener Status dafuer wuerde keinen realen Zustand abbilden (bewusst NICHT
// eingefuehrt, siehe Abschlussbericht "Architekturentscheidungen").
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
  // Phase 32 "Enterprise Incident Command Center & Operational Coordination".
  | "COMMAND_UPDATED";

export interface IncidentTimelineEvent {
  id: number;
  incidentId: number;
  eventType: IncidentTimelineEventType;
  message: string;
  metadata: Record<string, unknown> | null;
  actorUserId: string | null;
  createdAt: string;
}
