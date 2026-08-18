// Phase 63 "Enterprise Operational Portfolio Intelligence".
// Spiegelt src/types/operational-state.types.ts im Backend.

import type { RiskCorrelationGroup } from "./risk-correlation.types";
import type { PortfolioClassification } from "./service-portfolio.types";
import type { DecisionQuality } from "./outcome-intelligence.types";

export type CumulativeRiskSource = "PRIORITY_QUEUE" | "CAPACITY_WATCHLIST" | "RISK_CORRELATION" | "RECURRING_SAFETY_BLOCK";

export interface CumulativeRiskEntry {
  projectId: string;
  projectName: string;
  riskSourceCount: number;
  riskSources: CumulativeRiskSource[];
}

export interface CompetingChangePair {
  changeAId: number;
  changeATitle: string;
  changeBId: number;
  changeBTitle: string;
  sharedServiceIds: number[];
  sharedServiceNames: string[];
}

export interface OperationalStateOverview {
  organizationId: string;
  windowHours: number;
  generatedAt: string;
  criticalServiceCount: number;
  atRiskServiceCount: number;
  capacityWatchlistCount: number;
  riskCorrelationGroups: RiskCorrelationGroup[];
  automationGovernanceConflictProjectCount: number;
  portfolioCounts: Record<PortfolioClassification, number>;
  decisionQualityCounts: Record<DecisionQuality, number>;
  avgDecisionLatencyMs: number | null;
  changeSafetyBlockTriggeredCount: number;
  changeApprovedThenFailedCount: number;
  cumulativeRiskServices: CumulativeRiskEntry[];
  competingChanges: CompetingChangePair[];
}
