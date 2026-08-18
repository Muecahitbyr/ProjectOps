// AI Operations Office - reine Konfigurations-/Transformationsschicht
// (analog zu utils/automationCityMapper.ts): bildet ausschliesslich bereits
// vorhandene Backend-Daten (AutomationRule/AutomationAction/
// AutomationExecution/AttentionItem) auf die Buero-Metapher ab. Keine neue
// Datenquelle, keine neue Statuslogik - jeder AgentStatus-Wert leitet sich
// deterministisch aus bereits im Backend vorhandenen Enum-Werten ab
// (AutomationActionStatus/AutomationExecutionStatus).
import type { AutomationAction, AutomationExecution, AutomationRule, AutomationTrigger } from "../../types/automation.types";
import type { AttentionItemKind } from "../../types/attention.types";

export type DepartmentId = "incident-response" | "reliability-risk" | "change-management" | "problem-management" | "automation-governance";

export interface DepartmentConfig {
  id: DepartmentId;
  name: string;
  description: string;
  triggers: AutomationTrigger[];
  attentionKind: AttentionItemKind;
  // Phase 2 "Polish" - eine feste "Team-Farbe" je Abteilung (Wiedererkennung
  // "das ist der Incident-Response-Bereich"), bewusst NICHT deckungsgleich
  // mit den Tier-/Severity-Farben (theme/statusColors.ts) - eine Abteilung
  // ist nicht automatisch "kritisch", nur weil ihre Akzentfarbe warm ist.
  accentColor: string;
}

// Deterministische, dokumentierte Zuordnung - jede AutomationTrigger-
// Kategorie gehoert zu genau einer Abteilung; jede Abteilung besitzt genau
// eine passende AttentionItemKind (Phase 64) fuer ihre Aufgaben-Warteschlange.
export const DEPARTMENTS: DepartmentConfig[] = [
  {
    id: "incident-response",
    name: "Incident Response",
    description: "Handles active incidents, alerts and escalations",
    triggers: ["INCIDENT_CREATED", "INCIDENT_RESOLVED", "ALERT_TRIGGERED", "ALERT_ESCALATED", "ROOT_INCIDENT_CREATED", "CHECK_FAILED", "CHECK_RECOVERED"],
    attentionKind: "INCIDENT",
    accentColor: "#fb923c",
  },
  {
    id: "reliability-risk",
    name: "Reliability & Risk",
    description: "Watches service health, resilience and forecasted risk",
    triggers: ["PROJECT_CRITICAL", "PROJECT_WARNING", "RESILIENCE_DEGRADED", "RESILIENCE_RECOVERED", "PROACTIVE_RISK_DETECTED", "PROACTIVE_RISK_CLEARED"],
    attentionKind: "SERVICE_RISK",
    accentColor: "#eab308",
  },
  {
    id: "change-management",
    name: "Change Management",
    description: "Coordinates maintenance windows and deployments",
    triggers: ["MAINTENANCE_STARTED", "MAINTENANCE_ENDED"],
    attentionKind: "CHANGE",
    accentColor: "#3b82f6",
  },
  {
    id: "problem-management",
    name: "Problem Management",
    description: "Investigates root causes behind recurring incidents",
    triggers: [],
    attentionKind: "PROBLEM",
    accentColor: "#a78bfa",
  },
  {
    id: "automation-governance",
    name: "Automation Governance",
    description: "Oversees automation rules for conflicts and redundancy",
    triggers: [],
    attentionKind: "GOVERNANCE_CONFLICT",
    accentColor: "#2dd4bf",
  },
];

const TRIGGER_TO_DEPARTMENT: Partial<Record<AutomationTrigger, DepartmentId>> = {};
for (const dept of DEPARTMENTS) {
  for (const trigger of dept.triggers) TRIGGER_TO_DEPARTMENT[trigger] = dept.id;
}

export function departmentForRule(rule: Pick<AutomationRule, "trigger">): DepartmentId {
  return TRIGGER_TO_DEPARTMENT[rule.trigger] ?? "automation-governance";
}

const KIND_TO_DEPARTMENT: Record<AttentionItemKind, DepartmentId> = Object.fromEntries(
  DEPARTMENTS.map((dept) => [dept.attentionKind, dept.id]),
) as Record<AttentionItemKind, DepartmentId>;

export function departmentForAttentionKind(kind: AttentionItemKind): DepartmentId {
  return KIND_TO_DEPARTMENT[kind];
}

// "Idle -> Working -> Waiting -> Blocked -> Completed" - ausschliesslich aus
// bereits vorhandenen Backend-Zustaenden abgeleitet (AutomationActionStatus:
// PROPOSED|APPROVED|REJECTED; AutomationExecutionStatus: CREATED|RUNNING|
// SUCCESS|FAILED|CANCELLED). Keine neue Statusmaschine.
export type AgentStatus = "IDLE" | "WAITING" | "WORKING" | "BLOCKED" | "COMPLETED";

export const AGENT_STATUS_LABEL: Record<AgentStatus, string> = {
  IDLE: "Idle",
  WAITING: "Waiting for approval",
  WORKING: "Working",
  BLOCKED: "Blocked",
  COMPLETED: "Completed",
};

export const AGENT_STATUS_COLOR: Record<AgentStatus, string> = {
  IDLE: "#9ca3af",
  WAITING: "#f59e0b",
  WORKING: "#3b82f6",
  BLOCKED: "#ef4444",
  COMPLETED: "#22c55e",
};

export interface AgentSnapshot {
  rule: AutomationRule;
  department: DepartmentId;
  status: AgentStatus;
  latestAction: AutomationAction | null;
  latestExecution: AutomationExecution | null;
}

function latestByCreatedAt<T extends { createdAt: string }>(items: T[]): T | null {
  if (items.length === 0) return null;
  return [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null;
}

// Reine Transformation - nimmt bereits geladene Daten entgegen (drei
// bestehende Endpuente: /automation-rules, /automation-actions,
// /automation-executions), keine eigenen API-Aufrufe.
export function buildAgentSnapshots(rules: AutomationRule[], actions: AutomationAction[], executions: AutomationExecution[]): AgentSnapshot[] {
  return rules.map((rule) => {
    const ruleActions = actions.filter((a) => a.ruleId === rule.id);
    const latestAction = latestByCreatedAt(ruleActions);
    const actionExecutions = latestAction ? executions.filter((e) => e.automationActionId === latestAction.id) : [];
    const latestExecution = latestByCreatedAt(actionExecutions);

    let status: AgentStatus = "IDLE";
    if (latestAction?.status === "PROPOSED") {
      status = "WAITING";
    } else if (latestAction?.status === "REJECTED") {
      status = "BLOCKED";
    } else if (latestAction?.status === "APPROVED") {
      if (!latestExecution || latestExecution.status === "CREATED" || latestExecution.status === "RUNNING") {
        status = "WORKING";
      } else if (latestExecution.status === "SUCCESS") {
        status = "COMPLETED";
      } else {
        status = "BLOCKED";
      }
    }

    return { rule, department: departmentForRule(rule), status, latestAction, latestExecution };
  });
}
