// Phase 51 "Enterprise Decision Execution & Closed-Loop Operations".
// Spiegelt src/types/automation-outcome.types.ts im Backend.
export type AutomationExecutionOutcomeStatus = "IMPROVED" | "REGRESSED" | "NOT_IMPROVED" | "PENDING" | "NOT_APPLICABLE";

// Phase 52 "Continuous Operational Assurance" - siehe Kommentar im Backend-
// Original fuer die Bedeutung von MONITORING/DURABLE/REGRESSED.
export type OutcomeDurability = "MONITORING" | "DURABLE" | "REGRESSED";

export interface AutomationExecutionOutcome {
  executionId: number;
  automationActionId: number;
  actionType: string;
  trigger: string;
  projectId: string;
  status: AutomationExecutionOutcomeStatus;
  reason: string;
  verifiedAt: string | null;
  durability: OutcomeDurability | null;
  durabilityReason: string | null;
  regressedAt: string | null;
}

// Phase 53 "Enterprise Operational Learning & Optimization".
export type AutomationOutcomeTrackRecordClassification = "EFFECTIVE" | "MIXED" | "INEFFECTIVE" | "INSUFFICIENT_DATA";

export interface AutomationOutcomeTrackRecordEntry {
  actionType: string;
  trigger: string;
  totalVerified: number;
  durableImprovedCount: number;
  regressedCount: number;
  notImprovedCount: number;
  classification: AutomationOutcomeTrackRecordClassification;
}
