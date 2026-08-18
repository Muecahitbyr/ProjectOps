// Phase 22 "Enterprise Reliability, SLOs, SLA Monitoring & Service Health".
// Spiegelt src/types/slo.types.ts im Backend.

export type SliType = "AVAILABILITY" | "ERROR_RATE" | "LATENCY" | "API_AVAILABILITY" | "API_ERROR_RATE";

export type SloStatus = "HEALTHY" | "DEGRADED" | "CRITICAL";

export interface ErrorBudget {
  totalBudgetPercent: number;
  consumedPercent: number;
  remainingPercent: number;
  remainingPercentOfBudget: number;
  totalBudgetMinutes: number;
  consumedMinutes: number;
  remainingMinutes: number;
  burnRate: number;
  estimatedHoursToExhaustion: number | null;
  status: SloStatus;
}

export interface Slo {
  id: number;
  organizationId: string;
  teamId: string | null;
  projectId: string | null;
  checkId: string | null;
  name: string;
  description: string | null;
  sliType: SliType;
  target: number;
  latencyThresholdMs: number | null;
  windowDays: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SloWithCurrentStatus extends Slo {
  current: {
    sliValue: number;
    errorBudget: ErrorBudget;
    evaluatedAt: string;
  } | null;
}

export interface SloEvaluation {
  id: number;
  sloId: number;
  sliValue: number;
  target: number;
  errorBudgetRemainingPercent: number;
  burnRate: number;
  status: SloStatus;
  evaluatedAt: string;
}

export const SLI_TYPES: SliType[] = ["AVAILABILITY", "ERROR_RATE", "LATENCY", "API_AVAILABILITY", "API_ERROR_RATE"];

export const SLI_TYPE_LABELS: Record<SliType, string> = {
  AVAILABILITY: "Availability",
  ERROR_RATE: "Error Rate",
  LATENCY: "Latency",
  API_AVAILABILITY: "API Availability",
  API_ERROR_RATE: "API Error Rate",
};

export type SloHistoryWindow = "1h" | "24h" | "7d" | "30d";
export const SLO_HISTORY_WINDOWS: SloHistoryWindow[] = ["1h", "24h", "7d", "30d"];
