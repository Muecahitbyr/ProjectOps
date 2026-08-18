import type { NotificationChannelId } from "./notification-settings.types";
import type { RoleId } from "./user.types";

export type AlertMetric =
  | "HEALTH_SCORE"
  | "INCIDENT_SEVERITY"
  | "OFFLINE_DURATION"
  | "SSL_EXPIRY"
  | "RESPONSE_TIME"
  | "ERROR_COUNT"
  // Pseudo-Metriken ausschliesslich fuer COMPOSITE-Regeln (siehe CompositeCondition).
  | "MULTIPLE_CHECKS_OFFLINE"
  | "INCIDENT_SPIKE"
  // Phase 22 "Enterprise Reliability, SLOs, SLA Monitoring & Service
  // Health" Auftragspunkt 9 "SLO Alerting" - THRESHOLD-Metriken wie jede
  // andere, vergleichen den aktuellen SLI-Wert (SLO_BREACH) bzw. die
  // aktuelle Burn-Rate (SLO_BURN_RATE) einer referenzierten SLO
  // (AlertRule.sloId) gegen comparator/threshold. Reuse der bestehenden
  // THRESHOLD-Auswertung statt eines neuen ruleType/condition-Zweigs.
  | "SLO_BREACH"
  | "SLO_BURN_RATE";

export type AlertComparator = "LT" | "LTE" | "GT" | "GTE" | "EQ";

// Phase 9 "Intelligent Alert Engine": vier Regeltypen statt nur Threshold.
export type AlertRuleType = "THRESHOLD" | "TREND" | "ANOMALY" | "COMPOSITE";

// Eigene Severity der Regel (fuer Eskalation/Benachrichtigung) - unabhaengig
// von severityThreshold, das ausschliesslich als Vergleichswert fuer die
// Metrik INCIDENT_SEVERITY dient.
export type AlertRuleSeverity = "INFO" | "WARNING" | "HIGH" | "CRITICAL";

export interface TrendCondition {
  type: "TREND";
  metric: "HEALTH_SCORE" | "RESPONSE_TIME" | "ERROR_COUNT";
  direction: "DECREASING" | "INCREASING";
  // Anzahl aufeinanderfolgender Zeit-Buckets mit durchgehend fallender/
  // steigender Metrik, damit die Regel ausloest ("kontinuierlich").
  consecutivePoints: number;
  bucketMinutes: number;
}

export interface AnomalyCondition {
  type: "ANOMALY";
  metric: "ERROR_COUNT" | "RESPONSE_TIME";
  windowMinutes: number;
  baselineWindowMinutes: number;
  // Ausloesung wenn aktueller Wert > Baseline-Mittelwert + Multiplikator * Baseline-Stddev.
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
  id: number;
  projectId: string;
  name: string;
  ruleType: AlertRuleType;
  severity: AlertRuleSeverity;
  metric: AlertMetric;
  comparator: AlertComparator;
  threshold: number | null;
  severityThreshold: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null;
  windowMinutes: number | null;
  condition: AlertCondition | null;
  sloId: number | null;
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
  severityThreshold?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  windowMinutes?: number;
  condition?: AlertCondition;
  sloId?: number;
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
  severityThreshold?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null;
  windowMinutes?: number | null;
  condition?: AlertCondition | null;
  sloId?: number | null;
  enabled?: boolean;
}

// ---------------------------------------------------------------------------
// Alert Events (Deduplizierte Historie, Auftragspunkt 4)
// ---------------------------------------------------------------------------
export type AlertEventStatus = "TRIGGERED" | "RESOLVED" | "SUPPRESSED";

export interface AlertEvent {
  id: number;
  alertRuleId: number;
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

// ---------------------------------------------------------------------------
// Eskalationsstufen (Auftragspunkt 6)
// ---------------------------------------------------------------------------
export interface AlertEscalationStep {
  id: number;
  alertRuleId: number;
  stepOrder: number;
  afterMinutes: number;
  channelId: NotificationChannelId;
  additionalProjectRole: RoleId | null;
  // Phase 24 "Enterprise On-Call Scheduling & Escalation Routing" - optional:
  // wenn gesetzt, ermittelt alerts/alert-evaluator.ts beim Ausloesen dieser
  // Stufe zusaetzlich zum Kanal den aktuell diensthabenden Nutzer dieses
  // Schedules und haengt ihn an Nachricht/Webhook-Payload/Realtime-Event an.
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
