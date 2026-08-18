import type { IncidentAnalysis } from "../ai/analysis.types";

export interface NotificationPayload {
  projectId: string;
  projectName: string;
  checkId: string;
  error: string;
  timestamp: string;
  responseTimeMs?: number;
  analysis: IncidentAnalysis;
}
