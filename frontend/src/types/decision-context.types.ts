// Phase 50 "Enterprise Operational Decision & Executive Intelligence".
// Spiegelt src/types/decision-context.types.ts im Backend.
import type { ServiceResilienceDetail, PriorityQueueAcknowledgment } from "./resilience.types";
import type { ProjectAcknowledgmentOutcomeHistory } from "./outcome-intelligence.types";
import type { AutomationOutcomeTrackRecordEntry } from "./automation-outcome.types";
import type { AutomationRuleConflict } from "./governance.types";

export type RecommendationConfidence = "HIGH" | "MEDIUM" | "LOW";

export type RecommendationKind =
  | "UNACKNOWLEDGED_ACTIVE_ISSUE"
  | "HIGH_RISK_CHANGE_DURING_INCIDENT"
  | "RECURRING_OUTCOME_FAILURE"
  | "PROACTIVE_RISK_ACTIVE"
  | "FORECAST_SIGNAL_NO_AUTOMATION"
  | "AGENT_CAPACITY_RISK_AFFECTING_MONITORING"
  | "AUTOMATION_RULE_GOVERNANCE_CONFLICT";

export interface RecommendationActionRef {
  method: "GET" | "POST";
  path: string;
  label: string;
}

export interface Recommendation {
  kind: RecommendationKind;
  problem: string;
  relevantSignals: string[];
  recommendedAction: string;
  reasoning: string;
  expectedEffect: string;
  risks: string;
  confidence: RecommendationConfidence;
  requiredPermission: string;
  requiresApproval: boolean;
  alternative: string | null;
  actionRef: RecommendationActionRef | null;
}

export interface DecisionContextAutomationControl {
  ruleId: number;
  name: string;
  trigger: string;
  enabled: boolean;
  autoExecute: boolean;
  approvalRequired: boolean;
}

export interface DecisionContextProactiveRisk {
  active: boolean;
  detectedAt: string | null;
  signalTitles: string[];
}

export interface DecisionContext {
  projectId: string;
  projectName: string;
  serviceId: number | null;
  serviceName: string | null;
  lifecycleStatus: string | null;
  businessOwner: string | null;
  generatedAt: string;
  windowHours: number;
  detail: ServiceResilienceDetail | null;
  acknowledgment: PriorityQueueAcknowledgment | null;
  outcomeHistory: ProjectAcknowledgmentOutcomeHistory | null;
  automationControls: DecisionContextAutomationControl[];
  proactiveRisk: DecisionContextProactiveRisk;
  automationTrackRecord: AutomationOutcomeTrackRecordEntry[];
  // Phase 55 "Enterprise Capacity & Resource Optimization".
  agentCapacityRisk: { agentId: string; agentName: string; metric: string; projectedPercent: number | null; recommendedAction: string | null } | null;
  // Phase 61 "Enterprise Operational Governance Optimization".
  automationRuleConflicts: AutomationRuleConflict[];
  recommendations: Recommendation[];
}
