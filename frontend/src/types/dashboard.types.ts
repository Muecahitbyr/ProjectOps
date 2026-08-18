import type { HealthStatus } from "./common.types";

export interface ChecksSummary {
  total: number;
  online: number;
  warning: number;
  error: number;
}

export interface DashboardSummary {
  status: HealthStatus;
  generatedAt: string;
  cachedUntil: string;
  summary: {
    projects: { total: number; healthy: number; warning: number; critical: number };
    checks: ChecksSummary;
    incidents: { open: number; critical: number };
    // Seit Phase 5 (City-Visualisierung): AI Center / Notification Center.
    notifications: { total: number; failed: number };
    aiAnalyses: { total: number; fallback: number };
  };
}

export interface HealthResult {
  status: HealthStatus;
  score: number;
}

export interface ProjectHealthSummary {
  id: string;
  name: string;
  type: string;
  health: HealthResult;
  checks: ChecksSummary;
  openIncidents: number;
}
