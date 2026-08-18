import type { IncidentSeverity } from "./common.types";

// Lowercase-Wire-Format - siehe DashboardEventTypeWire im Backend. Nur
// incident_opened/incident_resolved werden aktuell tatsaechlich erzeugt; die
// uebrigen Werte sind im Backend-Datenmodell fuer spaeter vorbereitet.
export type DashboardEventType =
  | "check_warning"
  | "check_error"
  | "check_offline"
  | "incident_opened"
  | "incident_resolved"
  | "ai_analysis_created";

export interface DashboardEvent {
  type: DashboardEventType;
  incidentId: string;
  projectId: string;
  checkId: string;
  severity: IncidentSeverity;
  title: string;
  timestamp: string;
}
