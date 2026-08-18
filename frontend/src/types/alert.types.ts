import type { NotificationChannelId } from "./notification-settings.types";
import type { RoleId } from "./user.types";

export type AlertMetric =
  | "HEALTH_SCORE"
  | "INCIDENT_SEVERITY"
  | "OFFLINE_DURATION"
  | "SSL_EXPIRY"
  | "RESPONSE_TIME"
  | "ERROR_COUNT"
  | "MULTIPLE_CHECKS_OFFLINE"
  | "INCIDENT_SPIKE";

export type AlertComparator = "LT" | "LTE" | "GT" | "GTE" | "EQ";
export type AlertSeverityThreshold = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

// Phase 9 "Intelligent Alert Engine".
export type AlertRuleType = "THRESHOLD" | "TREND" | "ANOMALY" | "COMPOSITE";
export type AlertRuleSeverity = "INFO" | "WARNING" | "HIGH" | "CRITICAL";

export interface TrendCondition {
  type: "TREND";
  metric: "HEALTH_SCORE" | "RESPONSE_TIME" | "ERROR_COUNT";
  direction: "DECREASING" | "INCREASING";
  consecutivePoints: number;
  bucketMinutes: number;
}

export interface AnomalyCondition {
  type: "ANOMALY";
  metric: "ERROR_COUNT" | "RESPONSE_TIME";
  windowMinutes: number;
  baselineWindowMinutes: number;
  stdDevMultiplier: number;
}

export interface CompositeCondition {
  type: "COMPOSITE";
  mode: "MULTIPLE_CHECKS_OFFLINE" | "INCIDENT_SPIKE";
  minCount: number;
  windowMinutes?: number;
}

export type AlertCondition = TrendCondition | AnomalyCondition | CompositeCondition;

export interface AlertRule {
  id: string;
  projectId: string;
  name: string;
  ruleType: AlertRuleType;
  severity: AlertRuleSeverity;
  metric: AlertMetric;
  comparator: AlertComparator;
  threshold: number | null;
  severityThreshold: AlertSeverityThreshold | null;
  windowMinutes: number | null;
  condition: AlertCondition | null;
  enabled: boolean;
  currentlyTriggered: boolean;
  lastTriggeredAt: string | null;
  lastTriggeredValue: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAlertRuleInput {
  projectId: string;
  name: string;
  ruleType?: AlertRuleType;
  severity?: AlertRuleSeverity;
  metric: AlertMetric;
  comparator: AlertComparator;
  threshold?: number;
  severityThreshold?: AlertSeverityThreshold;
  windowMinutes?: number;
  condition?: AlertCondition;
  enabled?: boolean;
  createdBy?: string;
}

export interface UpdateAlertRuleInput {
  name?: string;
  ruleType?: AlertRuleType;
  severity?: AlertRuleSeverity;
  metric?: AlertMetric;
  comparator?: AlertComparator;
  threshold?: number | null;
  severityThreshold?: AlertSeverityThreshold | null;
  windowMinutes?: number | null;
  condition?: AlertCondition | null;
  enabled?: boolean;
}

// ---------------------------------------------------------------------------
// Alert Events (deduplizierte Historie)
// ---------------------------------------------------------------------------
export type AlertEventStatus = "TRIGGERED" | "RESOLVED" | "SUPPRESSED";

export interface AlertEvent {
  id: string;
  alertRuleId: string;
  alertRuleName: string;
  projectId: string;
  projectName: string;
  severity: AlertRuleSeverity;
  status: AlertEventStatus;
  startedAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
  occurrences: number;
  lastValue: string | null;
  suppressedReason: string | null;
}

export interface AlertEventQuery {
  projectId?: string;
  severity?: AlertRuleSeverity;
  status?: AlertEventStatus;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export interface AlertEventListResult {
  total: number;
  items: AlertEvent[];
}

// ---------------------------------------------------------------------------
// Eskalationsstufen
// ---------------------------------------------------------------------------
export interface AlertEscalationStep {
  id: string;
  alertRuleId: string;
  stepOrder: number;
  afterMinutes: number;
  channelId: NotificationChannelId;
  additionalProjectRole: RoleId | null;
  // Phase 24 "Enterprise On-Call Scheduling & Escalation Routing".
  onCallScheduleId: number | null;
  createdAt: string;
}

export interface CreateEscalationStepInput {
  stepOrder: number;
  afterMinutes: number;
  channelId: NotificationChannelId;
  additionalProjectRole?: RoleId;
  onCallScheduleId?: number | null;
}
