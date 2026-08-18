// Phase 27 "Enterprise On-Call & Escalation Management".
// Spiegelt db/migrations/0049_escalation_policies.sql.

export type EscalationTargetType = "USER" | "ON_CALL_SCHEDULE";
export const ESCALATION_TARGET_TYPES: EscalationTargetType[] = ["USER", "ON_CALL_SCHEDULE"];

export interface EscalationPolicy {
  id: number;
  organizationId: string;
  name: string;
  description: string | null;
  enabled: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EscalationPolicyStep {
  id: number;
  policyId: number;
  stepOrder: number;
  delayMinutes: number;
  targetType: EscalationTargetType;
  targetUserId: string | null;
  targetScheduleId: number | null;
  createdAt: string;
}

export interface EscalationPolicyWithSteps extends EscalationPolicy {
  steps: EscalationPolicyStep[];
}

export const MAX_ESCALATION_STEPS_PER_POLICY = 10;

// Auftragspunkt "aktueller On-Call-Responder sichtbar" - das aufgeloeste
// Ziel einer Eskalationsstufe zu einem konkreten Zeitpunkt (Incident-
// Eskalationsstatus, siehe routes/incidents.routes.ts GET .../escalation).
export interface ResolvedEscalationTarget {
  stepOrder: number;
  delayMinutes: number;
  targetType: EscalationTargetType;
  userId: string | null;
  userName: string | null;
}

export interface IncidentEscalationStatus {
  policy: EscalationPolicyWithSteps | null;
  currentStepOrder: number;
  currentTarget: ResolvedEscalationTarget | null;
  nextStep: { stepOrder: number; delayMinutes: number; dueAt: string } | null;
}
