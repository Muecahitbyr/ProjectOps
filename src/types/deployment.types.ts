// Phase 27 "Enterprise Deployment Tracking & Change Correlation".
// Spiegelt db/migrations/0048_deployments.sql.

export type DeploymentStatus = "SUCCESS" | "FAILED" | "IN_PROGRESS";
export const DEPLOYMENT_STATUSES: DeploymentStatus[] = ["SUCCESS", "FAILED", "IN_PROGRESS"];

export interface Deployment {
  id: number;
  projectId: string;
  environment: string;
  version: string;
  status: DeploymentStatus;
  description: string | null;
  deployedBy: string | null;
  deployedAt: string;
  createdAt: string;
}

export const MAX_DEPLOYMENT_VERSION_LENGTH = 200;
export const MAX_DEPLOYMENT_ENVIRONMENT_LENGTH = 100;
export const MAX_DEPLOYMENT_DESCRIPTION_LENGTH = 4000;

// Auftragspunkt "Incident-Korrelation" - Standard-/Maximalfenster fuer
// "welche Deployments lagen kurz vor diesem Incident" (routes/incidents.
// routes.ts GET /incidents/:id/recent-deployments).
export const DEFAULT_DEPLOYMENT_CORRELATION_WINDOW_MINUTES = 240;
export const MAX_DEPLOYMENT_CORRELATION_WINDOW_MINUTES = 1440;
