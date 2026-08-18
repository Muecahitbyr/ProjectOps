// Phase 28 "Enterprise Maintenance Windows, Change Management & Deployment
// Risk". Spiegelt db/migrations/0051_change_management.sql.

export type ChangeType = "STANDARD" | "NORMAL" | "EMERGENCY";
export const CHANGE_TYPES: ChangeType[] = ["STANDARD", "NORMAL", "EMERGENCY"];

// Phase 28 (Fortsetzung) - orthogonal zu ChangeType oben: ChangeType ist die
// ITIL-Prozessklasse (treibt die Freigabepflicht, siehe change-management.
// config.ts), ChangeCategory beantwortet stattdessen "WAS wurde geaendert".
export type ChangeCategory = "DEPLOYMENT" | "CONFIGURATION" | "INFRASTRUCTURE" | "DATABASE" | "SECURITY" | "MAINTENANCE" | "OTHER";
export const CHANGE_CATEGORIES: ChangeCategory[] = ["DEPLOYMENT", "CONFIGURATION", "INFRASTRUCTURE", "DATABASE", "SECURITY", "MAINTENANCE", "OTHER"];

// FAILED (Phase 28 Fortsetzung) - bewusst NICHT ueber approvalStatus/
// rejectionReason abgebildet, das ist ein anderer Zustand (ein Change kann
// genehmigt UND trotzdem beim Ausfuehren scheitern).
export type ChangeStatus = "DRAFT" | "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "FAILED";
export const CHANGE_STATUSES: ChangeStatus[] = ["DRAFT", "SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "FAILED"];

export type ChangeRisk = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export const CHANGE_RISKS: ChangeRisk[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export type ChangeApprovalStatus = "NOT_REQUIRED" | "PENDING" | "APPROVED" | "REJECTED";
export const CHANGE_APPROVAL_STATUSES: ChangeApprovalStatus[] = ["NOT_REQUIRED", "PENDING", "APPROVED", "REJECTED"];

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

// Phase 28 (Fortsetzung) Auftragspunkt 6 "Incident Correlation" - exakt
// dieselben Werte/dasselbe Muster wie DEFAULT_/MAX_DEPLOYMENT_CORRELATION_
// WINDOW_MINUTES (types/deployment.types.ts, Phase 27), fuer "welche
// Changes fanden unmittelbar vor einem Incident statt".
export const DEFAULT_CHANGE_CORRELATION_WINDOW_MINUTES = 240;
export const MAX_CHANGE_CORRELATION_WINDOW_MINUTES = 1440;
