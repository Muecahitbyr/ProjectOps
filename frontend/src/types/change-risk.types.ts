// Phase 29 "Enterprise Change Intelligence, Risk Correlation & Deployment
// Safety". Spiegelt src/core/change-risk.ts im Backend.

export type ChangeSafetyVerdict = "SAFE" | "WARNING" | "BLOCKED";

export interface ChangeRiskFactor {
  key: string;
  label: string;
  points: number;
  detail: string;
}

export interface ChangeRiskBlocker {
  key: string;
  label: string;
  detail: string;
}

export interface AffectedCriticalService {
  id: number;
  name: string;
  criticality: string;
}

export interface ChangeRiskAnalysis {
  changeId: number;
  score: number;
  verdict: ChangeSafetyVerdict;
  factors: ChangeRiskFactor[];
  blockers: ChangeRiskBlocker[];
  dataGaps: string[];
  affectedCriticalServices: AffectedCriticalService[];
  blastRadius: {
    affectedServiceCount: number;
    maxDepthReached: number;
    spofCount: number;
    hasCriticalPath: boolean;
  };
  openIncidents: { id: number; serviceId: number; serviceName: string; severity: string; title: string }[];
  atRiskSlos: { id: number; serviceId: number; serviceName: string; name: string; status: string }[];
  triggeredAlerts: { id: number; serviceId: number; serviceName: string; name: string }[];
  recentlyFailedChanges: { id: number; title: string; actualEndAt: string | null }[];
  recentDeployments: { id: number; projectId: string; version: string; status: string; deployedAt: string }[];
  linkedDeployment: { id: number; status: string; version: string } | null;
  activeMaintenanceConflicts: { projectId: string; maintenanceWindowId: number; conflictingChangeId: number | null }[];
}
