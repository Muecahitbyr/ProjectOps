// Spiegelt src/types/automation.types.ts im Backend. Ids aus BIGSERIAL-
// Spalten sind hier "string" (siehe Kommentar in incident.types.ts).
export type AutomationActionType =
  | "RESTART_SERVICE"
  | "CLEAR_CACHE"
  | "RUN_HEALTH_CHECK"
  | "CREATE_DIAGNOSTIC_SNAPSHOT"
  | "COLLECT_LOGS"
  | "RESTART_CONTAINER"
  | "RESTART_MONITOR"
  | "RETRY_CHECK"
  | "RELOAD_CONFIGURATION"
  | "FLUSH_QUEUE"
  | "CREATE_BACKUP"
  | "VERIFY_DEPENDENCIES";

export const AUTOMATION_ACTION_TYPES: readonly AutomationActionType[] = [
  "RESTART_SERVICE", "CLEAR_CACHE", "RUN_HEALTH_CHECK", "CREATE_DIAGNOSTIC_SNAPSHOT", "COLLECT_LOGS",
  "RESTART_CONTAINER", "RESTART_MONITOR", "RETRY_CHECK", "RELOAD_CONFIGURATION",
  "FLUSH_QUEUE", "CREATE_BACKUP", "VERIFY_DEPENDENCIES",
];

// Aktionen ohne Ausfuehrungslogik im Backend (siehe safe-action-runner.ts) -
// fuer die UI, um "Execute" dort gar nicht erst anzubieten.
export const ACTIONS_WITHOUT_EXECUTOR: readonly AutomationActionType[] = ["RESTART_SERVICE"];

export type AutomationActionStatus = "PROPOSED" | "APPROVED" | "REJECTED";

export type AutomationTrigger =
  | "INCIDENT_CREATED"
  | "INCIDENT_RESOLVED"
  | "ALERT_TRIGGERED"
  | "ALERT_ESCALATED"
  | "PROJECT_CRITICAL"
  | "PROJECT_WARNING"
  | "CHECK_FAILED"
  | "CHECK_RECOVERED"
  | "MAINTENANCE_STARTED"
  | "MAINTENANCE_ENDED"
  | "ROOT_INCIDENT_CREATED"
  // Phase 40 "Enterprise Resilience-Driven Automation" - Sync-Schritt wie
  // bei jeder anderen bereits dokumentierten Backend/Frontend-Erweiterung
  // in diesem System (siehe Backend-Kommentar in types/automation.types.ts).
  | "RESILIENCE_DEGRADED"
  | "RESILIENCE_RECOVERED"
  // Phase 49 "Enterprise Risk Forecasting & Proactive Operations
  // Intelligence" - Sync-Schritt wie bei jeder anderen bereits
  // dokumentierten Backend/Frontend-Erweiterung in diesem System.
  | "PROACTIVE_RISK_DETECTED"
  | "PROACTIVE_RISK_CLEARED";

export const AUTOMATION_TRIGGERS: readonly AutomationTrigger[] = [
  "INCIDENT_CREATED", "INCIDENT_RESOLVED", "ALERT_TRIGGERED", "ALERT_ESCALATED",
  "PROJECT_CRITICAL", "PROJECT_WARNING", "CHECK_FAILED", "CHECK_RECOVERED",
  "MAINTENANCE_STARTED", "MAINTENANCE_ENDED", "ROOT_INCIDENT_CREATED",
  "RESILIENCE_DEGRADED", "RESILIENCE_RECOVERED",
  "PROACTIVE_RISK_DETECTED", "PROACTIVE_RISK_CLEARED",
];

export interface AutomationActionContext {
  checkId?: string;
  alertRuleId?: string;
  alertEventId?: string;
  maintenanceWindowId?: string;
  rootIncidentId?: string;
  causeCheckType?: string;
}

export interface AutomationAction {
  id: string;
  projectId: string;
  incidentId: string | null;
  ruleId: string | null;
  action: AutomationActionType;
  trigger: string;
  context: AutomationActionContext | null;
  status: AutomationActionStatus;
  createdAt: string;
}

export type AutomationExecutionStatus = "CREATED" | "APPROVED" | "RUNNING" | "SUCCESS" | "FAILED" | "CANCELLED";

export interface AutomationExecution {
  id: string;
  automationActionId: string;
  status: AutomationExecutionStatus;
  result: Record<string, unknown> | null;
  error: string | null;
  dryRun: boolean;
  approvedBy: string | null;
  executedBy: string | null;
  stdout: string | null;
  stderr: string | null;
  exitCode: number | null;
  durationMs: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
}

export interface AutomationRuleConditions {
  healthScoreBelow?: number;
  healthScoreAbove?: number;
  checkType?: string;
}

export type AutomationSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

// Phase 30 "Enterprise Reliability, Automated Recovery & Operational
// Resilience" - dieselbe Skala wie AutomationSeverity, eigener Typ (siehe
// Backend-Kommentar in types/automation.types.ts fuer die Begruendung).
export type RecoveryRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface AutomationRule {
  id: string;
  projectId: string;
  teamId: string | null;
  name: string;
  checkType: string | null;
  minSeverity: AutomationSeverity;
  trigger: AutomationTrigger;
  priority: number;
  conditions: AutomationRuleConditions | null;
  action: AutomationActionType;
  autoExecute: boolean;
  approvalRequired: boolean;
  cooldownMinutes: number;
  maxExecutionsPerHour: number;
  enabled: boolean;
  riskLevel: RecoveryRiskLevel;
  timeoutSeconds: number;
  maxAttemptsPerIncident: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAutomationRuleInput {
  projectId: string;
  name: string;
  checkType?: string;
  minSeverity: AutomationSeverity;
  trigger: AutomationTrigger;
  priority?: number;
  conditions?: AutomationRuleConditions;
  action: AutomationActionType;
  autoExecute: boolean;
  approvalRequired: boolean;
  cooldownMinutes?: number;
  maxExecutionsPerHour?: number;
  enabled: boolean;
  riskLevel?: RecoveryRiskLevel;
  timeoutSeconds?: number;
  maxAttemptsPerIncident?: number;
}

export type UpdateAutomationRuleInput = Partial<Omit<CreateAutomationRuleInput, "projectId">>;

export type AutomationLogLevel = "INFO" | "WARN" | "ERROR";

export interface AutomationLog {
  id: string;
  executionId: string;
  timestamp: string;
  level: AutomationLogLevel;
  message: string;
  source: string;
}

export interface AutomationTemplate {
  id: string;
  name: string;
  description: string;
  trigger: AutomationTrigger;
  action: AutomationActionType;
  minSeverity: AutomationSeverity;
  priority: number;
  cooldownMinutes: number;
  maxExecutionsPerHour: number;
  approvalRequired: boolean;
  autoExecute: boolean;
  conditions?: AutomationRuleConditions;
}

export interface AutomationSuccessRate {
  total: number;
  success: number;
  failed: number;
  successRate: number;
}

export interface AutomationTriggerCount {
  trigger: string;
  count: number;
}

export interface AutomationActionFailureCount {
  action: string;
  failedCount: number;
}

export interface AutomationProjectCount {
  projectId: string;
  executionCount: number;
}

export interface AutomationTrendPoint {
  day: string;
  total: number;
  success: number;
  failed: number;
}

export interface AutomationHeatmapCell {
  weekday: number;
  hour: number;
  count: number;
}

export interface AutomationAnalytics {
  successRate: AutomationSuccessRate;
  averageDurationMs: number | null;
  averageApprovalTimeMs: number | null;
  topTriggers: AutomationTriggerCount[];
  topFailedActions: AutomationActionFailureCount[];
  mostAutomatedProjects: AutomationProjectCount[];
  trend: AutomationTrendPoint[];
  heatmap: AutomationHeatmapCell[];
}
