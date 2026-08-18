// Phase 11 "Enterprise Automation & Self-Healing" erweitert diese Typen um
// den Regel-Trigger, strukturierten Ausloese-Kontext und die vollen
// Ausfuehrungsdetails - RESTART_SERVICE bleibt bewusst ohne Ausfuehrungspfad
// (siehe automation/safe-action-runner.ts), genau wie in Phase 9/10.
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

export type AutomationActionStatus = "PROPOSED" | "APPROVED" | "REJECTED";

// Die elf Ausloeser, gegen die automation_rules.trigger geprueft wird (Teil 1).
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
  // Phase 40 "Enterprise Resilience-Driven Automation" - Gegenstuecke zu
  // notification-event.types.ts's RESILIENCE_STATUS_DEGRADED/RECOVERED
  // (Phase 38), hier als Automation-Trigger statt Benachrichtigung.
  // resilienceStatus (Phase 37) kombiniert Health/SLO/Incidents/Probleme/
  // Abhaengigkeiten/Change-Risiko - ein eigenstaendiges Signal, das
  // PROJECT_CRITICAL (reiner Health-Score) NICHT abdeckt.
  | "RESILIENCE_DEGRADED"
  | "RESILIENCE_RECOVERED"
  // Phase 49 "Enterprise Risk Forecasting & Proactive Operations
  // Intelligence" - Gegenstuecke zu notification-event.types.ts's
  // PROACTIVE_RISK_DETECTED/CLEARED (core/proactive-risk-alerting.ts), hier
  // als Automation-Trigger. Anders als RESILIENCE_DEGRADED (ein bereits
  // eingetretener Statuswechsel) feuert dieser Trigger, WAEHREND der Service
  // noch HEALTHY ist, aber sein Forecast (Phase 46) eine Verschlechterung
  // andeutet - erlaubt z.B. eine proaktive Automation-Regel (Diagnose-Skript,
  // Team-Benachrichtigung), bevor ein echter Vorfall entsteht.
  | "PROACTIVE_RISK_DETECTED"
  | "PROACTIVE_RISK_CLEARED";

// Strukturierte, je nach Trigger unterschiedlich befuellte Zusatzdaten -
// RETRY_CHECK braucht z.B. checkId, um zu wissen WELCHER Check erneut
// geprueft werden soll.
export interface AutomationActionContext {
  checkId?: string;
  alertRuleId?: number;
  alertEventId?: number;
  maintenanceWindowId?: number;
  rootIncidentId?: number;
  causeCheckType?: string;
}

export interface AutomationAction {
  id: number;
  projectId: string;
  incidentId: number | null;
  ruleId: number | null;
  action: AutomationActionType;
  trigger: string;
  context: AutomationActionContext | null;
  status: AutomationActionStatus;
  createdAt: string;
}

export type AutomationExecutionStatus = "CREATED" | "APPROVED" | "RUNNING" | "SUCCESS" | "FAILED" | "CANCELLED";

export interface AutomationExecution {
  id: number;
  automationActionId: number;
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

// Flexible Zusatzbedingungen ueber min_severity/check_type hinaus (Teil 1) -
// alle Felder optional, ungesetzte Felder werden nicht geprueft.
export interface AutomationRuleConditions {
  healthScoreBelow?: number;
  healthScoreAbove?: number;
  checkType?: string;
}

// Phase 30 "Enterprise Reliability, Automated Recovery & Operational
// Resilience" - dieselbe Vier-Stufen-Skala wie changes.risk (Phase 28), aber
// eine bewusst eigene, orthogonale Dimension: das Risiko EINER Wiederholung
// DIESER Aktion, nicht das Risiko des Incidents, der sie ausloest.
export type RecoveryRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface AutomationRule {
  id: number;
  projectId: string;
  // Phase 18 Auftragspunkt 3 - optionale Team-Zuordnung, mirrort
  // alert_rules.team_id (Phase 15). null = organisationsweit (bestehendes
  // Verhalten unveraendert).
  teamId: string | null;
  name: string;
  checkType: string | null;
  minSeverity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  trigger: AutomationTrigger;
  priority: number;
  conditions: AutomationRuleConditions | null;
  action: AutomationActionType;
  autoExecute: boolean;
  approvalRequired: boolean;
  cooldownMinutes: number;
  maxExecutionsPerHour: number;
  enabled: boolean;
  // Phase 30 - siehe core/recovery-safety.ts fuer die Auswertung.
  riskLevel: RecoveryRiskLevel;
  timeoutSeconds: number;
  maxAttemptsPerIncident: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AutomationLogLevel = "INFO" | "WARN" | "ERROR";

export interface AutomationLog {
  id: number;
  executionId: number;
  timestamp: string;
  level: AutomationLogLevel;
  message: string;
  source: string;
}

export interface AutomationBackup {
  id: number;
  projectId: string;
  automationExecutionId: number | null;
  data: Record<string, unknown>;
  createdAt: string;
}
