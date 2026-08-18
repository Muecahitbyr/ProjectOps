import type { ProjectSla } from "./analytics.types";

// Spiegelt src/types/sla-report.types.ts im Backend.
export interface SlaReport {
  projectId: string;
  projectName: string;
  sla: ProjectSla;
  incidentCount: number;
  alertTriggerCount: number;
  automationExecutionCount: number;
  generatedAt: string;
}
