// Phase 30 "Enterprise Reliability, Automated Recovery & Operational
// Resilience" - spiegelt src/core/recovery-safety.ts im Backend.
import type { AutomationAction, AutomationExecution, AutomationRule } from "./automation.types";

export type RecoverySafetyVerdict = "READY" | "BLOCKED" | "COOLDOWN" | "ALREADY_RUNNING" | "COMPLETED" | "FAILED";

export interface RecoverySafetyResult {
  verdict: RecoverySafetyVerdict;
  reason: string | null;
  existingActionId: string | null;
  attempts: number;
  maxAttempts: number;
  cooldownEndsAt: string | null;
}

export interface RecoveryActionEntry {
  rule: AutomationRule;
  safety: RecoverySafetyResult;
  hasExecutor: boolean;
}

export interface RecoveryActionsResponse {
  service: { id: string; name: string; criticality: string } | null;
  recoveryActions: RecoveryActionEntry[];
}

export interface RecoveryExecuteResponse {
  action: AutomationAction;
  execution: AutomationExecution;
}
