// Phase 45 "Enterprise Acknowledgment Outcome & Continuous Improvement
// Intelligence". Spiegelt src/types/outcome-intelligence.types.ts im Backend.
import type { ResilienceStatus } from "./resilience.types";

export type AcknowledgmentOutcomeStatus = "RESOLVED" | "PARTIALLY_RESOLVED" | "REGRESSED" | "UNRESOLVED" | "INSUFFICIENT_DATA";

// Phase 62 "Enterprise Operational Decision Quality".
export type DecisionTimeliness = "PROMPT" | "DELAYED" | "VERY_DELAYED" | "UNKNOWN";
export type DecisionQuality = "GOOD" | "LATE_BUT_EFFECTIVE" | "PROMPT_BUT_INEFFECTIVE" | "POOR" | "INCONCLUSIVE";

export interface AcknowledgmentOutcome {
  acknowledgedAt: string;
  acknowledgedBy: string;
  note: string | null;
  snapshotResilienceStatus: ResilienceStatus;
  snapshotPriorityScore: number;
  snapshotReason: string | null;
  outcomeStatus: AcknowledgmentOutcomeStatus;
  outcomeReason: string;
  bestStatusReached: ResilienceStatus;
  finalStatus: ResilienceStatus;
  transitionCount: number;
  timeToRecoveryMs: number | null;
  measurementWindowHours: number;
  windowElapsed: boolean;
  evaluatedAt: string;
  decisionLatencyMs: number | null;
  decisionTimeliness: DecisionTimeliness;
  decisionQuality: DecisionQuality;
}

export interface ProjectAcknowledgmentOutcomeHistory {
  projectId: string;
  projectName: string;
  outcomes: AcknowledgmentOutcome[];
}

export interface OutcomeIntelligenceProjectSummary {
  projectId: string;
  projectName: string;
  totalAcknowledgments: number;
  resolvedCount: number;
  partiallyResolvedCount: number;
  regressedCount: number;
  unresolvedCount: number;
  insufficientDataCount: number;
  isRecurringPattern: boolean;
}

export interface OutcomeIntelligenceSummary {
  organizationId: string;
  windowHours: number;
  generatedAt: string;
  totalAcknowledgments: number;
  evaluatedAcknowledgments: number;
  counts: Record<AcknowledgmentOutcomeStatus, number>;
  resolutionRatePercent: number | null;
  avgTimeToRecoveryMs: number | null;
  avgDecisionLatencyMs: number | null;
  decisionQualityCounts: Record<DecisionQuality, number>;
  recurringProjects: OutcomeIntelligenceProjectSummary[];
  projects: OutcomeIntelligenceProjectSummary[];
}
