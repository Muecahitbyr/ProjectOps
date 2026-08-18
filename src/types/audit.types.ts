export type AuditCategory =
  | "AUTH"
  | "ALERT"
  | "AUTOMATION"
  | "NOTIFICATION"
  | "INCIDENT"
  | "MAINTENANCE"
  | "BACKUP"
  | "USER"
  | "SYSTEM"
  // Phase 22 "Enterprise Reliability, SLOs, SLA Monitoring & Service
  // Health" - SLO-Konfigurationsaenderungen und Breach/Recovery-Ereignisse,
  // analog zu ALERT/INCIDENT als eigene, filterbare Kategorie.
  | "SLO"
  // Phase 23 "Enterprise Service Catalog, Dependency Mapping & Topology
  // Intelligence" - Service-/Dependency-Konfigurationsaenderungen.
  | "SERVICE"
  // Phase 24 "Enterprise On-Call Scheduling & Escalation Routing" -
  // Schedule-/Teilnehmer-/Override-Konfigurationsaenderungen.
  | "ON_CALL"
  // Phase 27 "Enterprise Deployment Tracking & Change Correlation" -
  // Deployment-Erfassung/-Loeschung. Bewusst BEIDE Stellen (DB-Check-
  // Constraint in derselben Migration UND dieser TS-Union-Typ) in einem
  // Zug ergaenzt - siehe Kommentar in db/migrations/0048_deployments.sql:
  // genau das war in Phase 22 ("SLO" zunaechst nur hier, nicht in der DB)
  // ein echter, gefundener Bug.
  | "DEPLOYMENT"
  // Phase 28 "Enterprise Maintenance Windows, Change Management &
  // Deployment Risk" - Change-Lebenszyklus (erstellt/gestartet/
  // abgeschlossen/abgebrochen/freigegeben/abgelehnt). MAINTENANCE (oben,
  // Phase 9) bleibt unveraendert fuer manuelle Wartungsfenster zustaendig.
  | "CHANGE"
  // Phase 35 "Enterprise Problem Management & Root-Cause Intelligence" -
  // Problem-CRUD und Incident-/Change-Verknuepfungen. DB-CHECK-Constraint
  // audit_log_category_check wurde IN DERSELBEN Migration ergaenzt
  // (Migration 0057) - siehe dortiger Kommentar zum Phase-22-Bug.
  | "PROBLEM";

export type AuditSeverity = "INFO" | "WARNING" | "CRITICAL";

export interface AuditLogEntry {
  id: number;
  userId: string | null;
  action: string;
  category: AuditCategory;
  severity: AuditSeverity;
  projectId: string | null;
  message: string;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}
