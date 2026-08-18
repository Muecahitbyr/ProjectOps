// Spiegelt src/types/audit.types.ts im Backend.
// Phase 28 "Enterprise Maintenance Windows, Change Management & Deployment
// Risk" - live beim Schreiben der E2E-Tests gefunden: DEPLOYMENT (Phase 27)
// fehlte hier bereits, dieselbe Luecke wurde fuer CHANGE nicht wiederholt.
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
  | "SLO"
  | "SERVICE"
  | "ON_CALL"
  | "DEPLOYMENT"
  | "CHANGE"
  | "PROBLEM";
export type AuditSeverity = "INFO" | "WARNING" | "CRITICAL";

export interface AuditLogEntry {
  id: string;
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
