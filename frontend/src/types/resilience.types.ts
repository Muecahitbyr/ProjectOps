// Phase 37 "Enterprise Service Resilience & Dependency Intelligence".
// Spiegelt src/types/resilience.types.ts im Backend.

import type { SloStatus } from "./slo.types";
import type { ServiceCriticality, DependencyCriticality, DependencyType } from "./service.types";

export type ResilienceRange = "24h" | "7d" | "30d" | "90d";

export interface ResilienceOverviewParams {
  organizationId: string;
  range: ResilienceRange;
  projectId?: string;
}

export type ResilienceStatus = "HEALTHY" | "DEGRADED" | "AT_RISK" | "CRITICAL" | "UNKNOWN";
export const RESILIENCE_STATUSES: ResilienceStatus[] = ["HEALTHY", "DEGRADED", "AT_RISK", "CRITICAL", "UNKNOWN"];

export type ResilienceSignalType =
  | "POTENTIAL_SINGLE_POINT_OF_FAILURE"
  | "CRITICAL_DEPENDENCY_UNHEALTHY"
  | "HIGH_INCIDENT_RATE"
  | "RECURRING_INCIDENT_PATTERN"
  | "OPEN_CRITICAL_PROBLEM"
  | "SLO_AT_RISK"
  | "ERROR_BUDGET_LOW"
  | "HIGH_CHANGE_RISK"
  | "REGRESSED_REMEDIATION"
  | "LARGE_BLAST_RADIUS"
  // Phase 42 "Enterprise Resilience Forecast Intelligence".
  | "PROJECTED_DEGRADATION"
  | "PROJECTED_INCIDENT_INCREASE"
  // Phase 46 "Enterprise Capacity Early-Warning & Trend Intelligence".
  | "PROJECTED_RESPONSE_TIME_DEGRADATION";

export type ResilienceSignalSeverity = "INFO" | "WARNING" | "CRITICAL";

export interface ResilienceSignal {
  type: ResilienceSignalType;
  severity: ResilienceSignalSeverity;
  title: string;
  explanation: string;
  affectedEntity: { kind: "SERVICE" | "PROJECT" | "SLO" | "PROBLEM" | "CHANGE"; id: string | number; name: string };
}

export interface ResilienceOverviewRow {
  projectId: string;
  projectName: string;
  serviceId: number | null;
  serviceName: string | null;
  serviceCriticality: ServiceCriticality | null;
  healthScore: number;
  healthStatus: "HEALTHY" | "DEGRADED" | "CRITICAL" | "UNKNOWN";
  incidentCount: number;
  highCriticalCount: number;
  openIncidentCount: number;
  mttrMs: number | null;
  recurringIncidentCount: number;
  openProblems: number;
  openCriticalProblems: number;
  sloCount: number;
  criticalSLOCount: number;
  worstSloStatus: SloStatus | null;
  errorBudgetRisk: boolean;
  dependencyCount: number;
  dependentCount: number;
  blastRadius: number;
  isPotentialSpof: boolean;
  resilienceStatus: ResilienceStatus;
}

export interface ResilienceOverview {
  windowHours: number;
  organizationId: string;
  projectCount: number;
  summary: {
    critical: number;
    atRisk: number;
    degraded: number;
    healthy: number;
    unknown: number;
    potentialSpofCount: number;
  };
  rows: ResilienceOverviewRow[];
}

export interface ResilienceDependencyEntry {
  serviceId: number;
  serviceName: string;
  projectId: string | null;
  dependencyType: DependencyType;
  criticality: DependencyCriticality;
  healthStatus: "HEALTHY" | "DEGRADED" | "CRITICAL" | "UNKNOWN";
  openIncidents: number;
  worstSloStatus: SloStatus | null;
}

export interface ServiceDependencyIntelligence {
  serviceId: number;
  serviceName: string;
  dependencies: ResilienceDependencyEntry[];
  dependents: ResilienceDependencyEntry[];
}

export interface ServiceChangeRiskSummary {
  changeId: number;
  title: string;
  status: string;
  score: number;
  verdict: "SAFE" | "WARNING" | "BLOCKED";
}

// Phase 42 "Enterprise Resilience Forecast Intelligence".
export type ResilienceForecastTrend = "IMPROVING" | "STABLE" | "DEGRADING" | "UNKNOWN";

export interface ResilienceForecastSummary {
  sufficientData: boolean;
  slopePerDay: number | null;
  rSquared: number | null;
  currentValue: number | null;
  projectedValue: number | null;
  forecastDays: number;
  trend: ResilienceForecastTrend;
}

export interface ServiceResilienceForecast {
  healthScore: ResilienceForecastSummary;
  incidentCount: ResilienceForecastSummary;
  // Phase 46 "Enterprise Capacity Early-Warning & Trend Intelligence".
  responseTimeMs: ResilienceForecastSummary;
}

export interface ServiceResilienceDetail {
  projectId: string;
  projectName: string;
  serviceId: number | null;
  serviceName: string | null;
  serviceCriticality: ServiceCriticality | null;
  resilienceStatus: ResilienceStatus;
  health: {
    status: "HEALTHY" | "DEGRADED" | "CRITICAL" | "UNKNOWN";
    reasons: string[];
    openIncidents: number;
  };
  reliability: {
    incidentCount: number;
    highCriticalCount: number;
    mttrMs: number | null;
    recurringIncidentCount: number;
  };
  slo: {
    sloCount: number;
    worstSloStatus: SloStatus | null;
    avgErrorBudgetRemainingPercent: number | null;
  };
  problems: {
    openCount: number;
    openCriticalCount: number;
    items: { id: number; title: string; status: string; priority: string }[];
  };
  dependencies: ServiceDependencyIntelligence | null;
  blastRadius: {
    affectedServiceCount: number;
    maxDepthReached: number;
    truncated: boolean;
    hasCriticalPath: boolean;
    spofCount: number;
  } | null;
  isPotentialSpof: boolean;
  activeChangeRisks: ServiceChangeRiskSummary[];
  remediationEffectiveness: { problemId: number; changeId: number; changeTitle: string; status: string }[];
  forecast: ServiceResilienceForecast;
  signals: ResilienceSignal[];
  // Phase 47 "Enterprise Business Impact & Service Criticality Intelligence".
  businessImpact: import("./business-impact.types").ServiceBusinessImpact;
}

// Phase 43 "Enterprise Operational Priority Intelligence".
export type PriorityQueueConfidence = "HIGH" | "MEDIUM";

export interface PriorityQueueReason {
  signalType: ResilienceSignalType;
  severity: ResilienceSignalSeverity;
  title: string;
  explanation: string;
}

// Phase 44 "Enterprise Priority Queue Acknowledgment Governance".
export interface PriorityQueueAcknowledgment {
  acknowledgedBy: string;
  acknowledgedAt: string;
  note: string | null;
  snapshotResilienceStatus: ResilienceStatus;
  snapshotPriorityScore: number;
  snapshotReason: string | null;
}

export interface PriorityQueueEntry {
  projectId: string;
  projectName: string;
  serviceId: number | null;
  serviceName: string | null;
  resilienceStatus: ResilienceStatus;
  priorityScore: number;
  primaryReason: PriorityQueueReason | null;
  recommendedAction: string;
  confidence: PriorityQueueConfidence;
  signalCount: number;
  acknowledgment: PriorityQueueAcknowledgment | null;
}

export interface PriorityQueue {
  organizationId: string;
  windowHours: number;
  generatedAt: string;
  entries: PriorityQueueEntry[];
}
