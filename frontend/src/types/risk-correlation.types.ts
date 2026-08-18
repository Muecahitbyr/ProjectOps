// Phase 58 "Enterprise Operational Risk Correlation".
// Spiegelt src/types/risk-correlation.types.ts im Backend.

export type RiskCorrelationRootCauseKind = "DEPENDENCY" | "AGENT_CAPACITY";

export interface RiskCorrelationAffectedProject {
  projectId: string;
  projectName: string;
  resilienceStatus: "HEALTHY" | "DEGRADED" | "AT_RISK" | "CRITICAL" | "UNKNOWN";
}

export interface RiskCorrelationGroup {
  rootCauseKind: RiskCorrelationRootCauseKind;
  rootCauseId: string;
  rootCauseName: string;
  severity: "WARNING" | "CRITICAL";
  affectedProjects: RiskCorrelationAffectedProject[];
  recommendedAction: string;
}
