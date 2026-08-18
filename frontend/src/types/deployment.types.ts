// Phase 27 "Enterprise Deployment Tracking & Change Correlation".
// Spiegelt src/types/deployment.types.ts im Backend. id ist "number" (nicht
// "string" wie bei Incident.id) - das Backend-Repository (deployments.
// repository.ts) konvertiert die BIGINT-Id-Spalte explizit per Number(),
// die JSON-Antwort enthaelt also eine echte Zahl (gleiches Prinzip wie
// Postmortems/Services, siehe deren Typ-Dateien).

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

export const DEFAULT_DEPLOYMENT_CORRELATION_WINDOW_MINUTES = 240;
