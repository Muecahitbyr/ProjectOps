import type { CheckStatus } from "./common.types";
import type { HealthResult } from "./dashboard.types";
import type { Incident } from "./incident.types";

export interface ProjectCheckDetail {
  id: string;
  type: string;
  status: CheckStatus | null;
  lastRun: string | null;
  responseTimeMs: number | null;
}

export interface ProjectDashboardDetail {
  project: { id: string; name: string; description: string | null };
  health: HealthResult;
  checks: ProjectCheckDetail[];
  recentIncidents: Incident[];
  lastSuccessfulCheck: string | null;
  lastFailedCheck: string | null;
  averageResponseTimeMs: number | null;
  fastestResponseTimeMs: number | null;
  slowestResponseTimeMs: number | null;
  p95ResponseTimeMs: number | null;
  availability24h: number;
  availability7d: number;
}
