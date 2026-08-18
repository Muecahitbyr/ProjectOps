// Phase 28 "Enterprise Maintenance Windows, Change Management & Deployment
// Risk" (+ Fortsetzung "Enterprise Change Management & Deployment
// Intelligence"). Spiegelt src/types/change.types.ts im Backend.

export type ChangeType = "STANDARD" | "NORMAL" | "EMERGENCY";
export const CHANGE_TYPES: ChangeType[] = ["STANDARD", "NORMAL", "EMERGENCY"];

// Orthogonal zu ChangeType oben: ChangeType ist die ITIL-Prozessklasse
// (treibt die Freigabepflicht), ChangeCategory beantwortet "WAS wurde
// geaendert".
export type ChangeCategory = "DEPLOYMENT" | "CONFIGURATION" | "INFRASTRUCTURE" | "DATABASE" | "SECURITY" | "MAINTENANCE" | "OTHER";
export const CHANGE_CATEGORIES: ChangeCategory[] = ["DEPLOYMENT", "CONFIGURATION", "INFRASTRUCTURE", "DATABASE", "SECURITY", "MAINTENANCE", "OTHER"];

// FAILED - "War die Aenderung erfolgreich?", ein eigener Endzustand,
// getrennt von CANCELLED (vor der Ausfuehrung abgebrochen).
export type ChangeStatus = "DRAFT" | "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "FAILED";
export const CHANGE_STATUSES: ChangeStatus[] = ["DRAFT", "SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "FAILED"];

export type ChangeRisk = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export const CHANGE_RISKS: ChangeRisk[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export type ChangeApprovalStatus = "NOT_REQUIRED" | "PENDING" | "APPROVED" | "REJECTED";

export interface Change {
  id: number;
  organizationId: string;
  title: string;
  description: string | null;
  changeType: ChangeType;
  category: ChangeCategory;
  status: ChangeStatus;
  risk: ChangeRisk;
  riskAssessment: string | null;
  rollbackPlan: string | null;
  ownerId: string | null;
  plannedStartAt: string | null;
  plannedEndAt: string | null;
  actualStartAt: string | null;
  actualEndAt: string | null;
  approvalStatus: ChangeApprovalStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  emergencyJustification: string | null;
  deploymentId: number | null;
  failureReason: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChangeWithServices extends Change {
  serviceIds: number[];
}

export const MAX_SERVICES_PER_CHANGE = 25;

export const DEFAULT_CHANGE_CORRELATION_WINDOW_MINUTES = 240;
export const MAX_CHANGE_CORRELATION_WINDOW_MINUTES = 1440;

// Auftragspunkt 7 "sauber konfigurierbar, nicht hart an UI gekoppelt" - das
// Frontend zeigt nur einen HINWEIS basierend auf dieser Kopie der Backend-
// Regel (config/change-management.config.ts); durchgesetzt wird sie
// ausschliesslich serverseitig (POST /changes/:id/start liefert 403, falls
// die UI-Vorabpruefung je von der Backend-Regel abweichen sollte).
export function isApprovalRequiredToStart(changeType: ChangeType, risk: ChangeRisk): boolean {
  if (changeType === "EMERGENCY") return false;
  return risk === "HIGH" || risk === "CRITICAL";
}
