// Phase 35 "Enterprise Problem Management & Root-Cause Intelligence".
// Spiegelt src/types/problem.types.ts im Backend.

export type ProblemStatus = "OPEN" | "INVESTIGATING" | "KNOWN_ERROR" | "MITIGATED" | "RESOLVED" | "CLOSED";
export const PROBLEM_STATUSES: ProblemStatus[] = ["OPEN", "INVESTIGATING", "KNOWN_ERROR", "MITIGATED", "RESOLVED", "CLOSED"];

export type ProblemPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export const PROBLEM_PRIORITIES: ProblemPriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export interface Problem {
  id: number;
  organizationId: string;
  title: string;
  description: string | null;
  status: ProblemStatus;
  priority: ProblemPriority;
  ownerUserId: string | null;
  rootCause: string | null;
  workaround: string | null;
  remediation: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface ProblemIncidentLink {
  id: number;
  problemId: number;
  incidentId: number;
  createdBy: string | null;
  createdAt: string;
}

export interface ProblemChangeLink {
  id: number;
  problemId: number;
  changeId: number;
  createdBy: string | null;
  createdAt: string;
}

export interface ProblemImpact {
  incidentCount: number;
  highCriticalIncidentCount: number;
  affectedProjectIds: string[];
  affectedServiceIds: number[];
  totalIncidentDurationMs: number | null;
  avgMttrMs: number | null;
  firstIncidentAt: string | null;
  lastIncidentAt: string | null;
}

export interface ProblemSloImpact {
  sloId: number;
  sloName: string;
  projectId: string | null;
  currentStatus: "HEALTHY" | "DEGRADED" | "CRITICAL" | "PENDING";
  breachesDuringProblemWindow: number;
}

export interface ProblemIncidentPostmortemSummary {
  incidentId: number;
  hasPostmortem: boolean;
  postmortemStatus: "DRAFT" | "IN_REVIEW" | "PUBLISHED" | null;
  postmortemRootCause: string | null;
  openActionItems: number;
  doneActionItems: number;
}

export interface ProblemRootCauseHint {
  key: string;
  text: string;
}

export interface ProblemRelatedIncident {
  id: number;
  projectId: string;
  checkId: string;
  title: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  resolved: boolean;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ProblemRelatedChange {
  id: number;
  title: string;
  status: string;
  risk: string;
}

export interface ProblemDetail extends Problem {
  impact: ProblemImpact;
  sloImpact: ProblemSloImpact[];
  postmortems: ProblemIncidentPostmortemSummary[];
  rootCauseHints: ProblemRootCauseHint[];
  relatedIncidents: ProblemRelatedIncident[];
  relatedChanges: ProblemRelatedChange[];
}

export interface ProblemCandidate {
  checkId: string;
  checkType: string;
  projectId: string;
  projectName: string;
  incidentCount: number;
  criticalCount: number;
  firstIncidentAt: string;
  lastIncidentAt: string;
  avgMttrMs: number | null;
  hasOpenProblem: boolean;
}

export interface ProblemListRow extends Problem {
  incidentCount: number;
  criticalIncidentCount: number;
  lastIncidentAt: string | null;
  sloImpactCount: number;
}

export interface RelatedProblemSummary {
  id: number;
  title: string;
  status: ProblemStatus;
  priority: ProblemPriority;
}
