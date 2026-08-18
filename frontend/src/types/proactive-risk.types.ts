// Phase 49 "Enterprise Risk Forecasting & Proactive Operations Intelligence".
// Spiegelt src/types/proactive-risk.types.ts im Backend.
export type ForecastAccuracyOutcome = "CONFIRMED" | "FALSE_POSITIVE" | "PENDING";

export interface ProactiveRiskDetectionRecord {
  projectId: string;
  projectName: string;
  serviceId: number | null;
  serviceName: string | null;
  criticality: string | null;
  detectedAt: string;
  clearedAt: string | null;
  signalTitles: string[];
  explanation: string;
  outcome: ForecastAccuracyOutcome;
  outcomeReason: string;
}

export interface ForecastAccuracySummary {
  organizationId: string;
  windowHours: number;
  generatedAt: string;
  totalDetections: number;
  evaluatedDetections: number;
  confirmedCount: number;
  falsePositiveCount: number;
  pendingCount: number;
  accuracyRatePercent: number | null;
  detections: ProactiveRiskDetectionRecord[];
}
