// Phase 61 "Enterprise Operational Governance Optimization".
// Spiegelt src/types/governance.types.ts im Backend.
import type { AutomationTrigger, AutomationActionType } from "./automation.types";

export type GovernanceRuleConflictKind = "CONTRADICTORY_ACTIONS" | "REDUNDANT_DUPLICATE";

export interface GovernanceConflictingRule {
  ruleId: number;
  name: string;
  action: AutomationActionType;
  autoExecute: boolean;
  approvalRequired: boolean;
  priority: number;
}

export interface AutomationRuleConflict {
  trigger: AutomationTrigger;
  kind: GovernanceRuleConflictKind;
  rules: GovernanceConflictingRule[];
}
