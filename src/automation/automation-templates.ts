import type { AutomationActionType, AutomationRuleConditions, AutomationTrigger } from "../types/automation.types";

// Teil 5 "Automation Templates" - vorgefertigte, sofort sinnvolle
// Regel-Vorlagen. "Backup before restart" hat bewusst eine niedrigere
// priority-Zahl (laeuft zuerst) als eine gleichzeitig auf PROJECT_CRITICAL
// reagierende Neustart-Regel - ein echtes Beispiel fuer die in Teil 1
// geforderte Prioritaets-Reihenfolge (kleinere Zahl = frueher).
export interface AutomationTemplate {
  id: string;
  name: string;
  description: string;
  trigger: AutomationTrigger;
  action: AutomationActionType;
  minSeverity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  priority: number;
  cooldownMinutes: number;
  maxExecutionsPerHour: number;
  approvalRequired: boolean;
  autoExecute: boolean;
  conditions?: AutomationRuleConditions;
}

export const AUTOMATION_TEMPLATES: readonly AutomationTemplate[] = [
  {
    id: "restart-unhealthy-project",
    name: "Restart unhealthy project",
    description: "When a project's overall health becomes CRITICAL, reset the monitor state and re-run all checks.",
    trigger: "PROJECT_CRITICAL",
    action: "RESTART_MONITOR",
    minSeverity: "CRITICAL",
    priority: 20,
    cooldownMinutes: 30,
    maxExecutionsPerHour: 4,
    approvalRequired: true,
    autoExecute: false,
  },
  {
    id: "retry-failed-api",
    name: "Retry failed API",
    description: "When any check fails, immediately retry it once before an incident analysis runs its course.",
    trigger: "CHECK_FAILED",
    action: "RETRY_CHECK",
    minSeverity: "LOW",
    priority: 10,
    cooldownMinutes: 5,
    maxExecutionsPerHour: 20,
    approvalRequired: false,
    autoExecute: true,
  },
  {
    id: "restart-monitor",
    name: "Restart monitor",
    description: "When a new incident opens, reset the scheduler's internal state for the affected project.",
    trigger: "INCIDENT_CREATED",
    action: "RESTART_MONITOR",
    minSeverity: "HIGH",
    priority: 30,
    cooldownMinutes: 15,
    maxExecutionsPerHour: 6,
    approvalRequired: true,
    autoExecute: false,
  },
  {
    id: "collect-diagnostics",
    name: "Collect diagnostics",
    description: "When a new incident opens, capture a diagnostic snapshot for later analysis.",
    trigger: "INCIDENT_CREATED",
    action: "CREATE_DIAGNOSTIC_SNAPSHOT",
    minSeverity: "MEDIUM",
    priority: 10,
    cooldownMinutes: 5,
    maxExecutionsPerHour: 20,
    approvalRequired: false,
    autoExecute: true,
  },
  {
    id: "backup-before-restart",
    name: "Backup before restart",
    description: "When a project turns CRITICAL, back up its automation/monitoring configuration before anything else runs.",
    trigger: "PROJECT_CRITICAL",
    action: "CREATE_BACKUP",
    minSeverity: "CRITICAL",
    priority: 10,
    cooldownMinutes: 30,
    maxExecutionsPerHour: 4,
    approvalRequired: false,
    autoExecute: true,
  },
  {
    id: "clear-cache-after-deployment",
    name: "Clear cache after deployment",
    description: "When a maintenance window ends (the closest real signal ProjectOps has to \"after a deployment\"), clear the dashboard cache.",
    trigger: "MAINTENANCE_ENDED",
    action: "CLEAR_CACHE",
    minSeverity: "LOW",
    priority: 10,
    cooldownMinutes: 0,
    maxExecutionsPerHour: 20,
    approvalRequired: false,
    autoExecute: true,
  },
  {
    id: "dependency-verification",
    name: "Dependency verification",
    description: "After an incident resolves, verify all of the project's dependencies (checks) are healthy again.",
    trigger: "INCIDENT_RESOLVED",
    action: "VERIFY_DEPENDENCIES",
    minSeverity: "LOW",
    priority: 10,
    cooldownMinutes: 10,
    maxExecutionsPerHour: 10,
    approvalRequired: false,
    autoExecute: true,
  },
  // Phase 40 "Enterprise Resilience-Driven Automation" - reagiert auf
  // resilienceStatus (Phase 37: Health+SLO+Incidents+Probleme+Abhaengigkeiten
  // +Change-Risiko kombiniert), nicht nur auf den reinen Health-Score wie
  // "backup-before-restart" (PROJECT_CRITICAL) oben - ein Snapshot ist eine
  // sichere, rein lesende Aktion, daher ohne Freigabe automatisch ausfuehrbar.
  {
    id: "resilience-degraded-diagnostics",
    name: "Diagnose on resilience degradation",
    description: "When a service's overall resilience status degrades to AT_RISK or CRITICAL, capture a diagnostic snapshot for later analysis.",
    trigger: "RESILIENCE_DEGRADED",
    action: "CREATE_DIAGNOSTIC_SNAPSHOT",
    minSeverity: "HIGH",
    priority: 10,
    cooldownMinutes: 15,
    maxExecutionsPerHour: 6,
    approvalRequired: false,
    autoExecute: true,
  },
  // Phase 49 "Enterprise Risk Forecasting & Proactive Operations
  // Intelligence" - anders als resilience-degraded-diagnostics oben (ein
  // bereits eingetretener Zustand, hohe Sicherheit) basiert dieser Trigger
  // auf einem 30-Tage-Forecast (MEDIUM Confidence, Phase 43's etablierte
  // Regel fuer forecast-basierte Signale) - der Service ist zum
  // Ausloesezeitpunkt noch HEALTHY. Deshalb approvalRequired=true statt
  // autoExecute: die Unsicherheit einer Prognose rechtfertigt eine
  // menschliche Bestaetigung, auch wenn die Aktion selbst (Snapshot) sicher
  // ist.
  {
    id: "proactive-risk-diagnostics",
    name: "Diagnose on proactive risk detection",
    description: "When a currently healthy, business-relevant service starts showing a degrading capacity/forecast trend, capture a diagnostic snapshot before it becomes a real incident.",
    trigger: "PROACTIVE_RISK_DETECTED",
    action: "CREATE_DIAGNOSTIC_SNAPSHOT",
    minSeverity: "MEDIUM",
    priority: 20,
    cooldownMinutes: 60,
    maxExecutionsPerHour: 4,
    approvalRequired: true,
    autoExecute: false,
  },
];

export function getAutomationTemplateById(id: string): AutomationTemplate | undefined {
  return AUTOMATION_TEMPLATES.find((template) => template.id === id);
}
