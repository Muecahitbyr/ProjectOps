// Phase 32 "Enterprise Incident Command Center & Operational Coordination" -
// spiegelt src/types/incident-command.types.ts.
export type IncidentCommandRoleType = "INCIDENT_COMMANDER" | "TECHNICAL_LEAD" | "COMMUNICATIONS_LEAD";
export const INCIDENT_COMMAND_ROLE_TYPES: IncidentCommandRoleType[] = ["INCIDENT_COMMANDER", "TECHNICAL_LEAD", "COMMUNICATIONS_LEAD"];

export interface IncidentCommandRole {
  id: string;
  incidentId: string;
  role: IncidentCommandRoleType;
  userId: string;
  userName: string;
  assignedBy: string | null;
  assignedAt: string;
}

export type ChecklistItemStatus = "OPEN" | "DONE" | "SKIPPED";
export const CHECKLIST_ITEM_STATUSES: ChecklistItemStatus[] = ["OPEN", "DONE", "SKIPPED"];

export type ChecklistItemKey =
  | "COMMANDER_ASSIGNED"
  | "TECHNICAL_LEAD_ASSIGNED"
  | "COMMUNICATION_ASSESSED"
  | "STAKEHOLDERS_NOTIFIED"
  | "BLAST_RADIUS_REVIEWED"
  | "RECENT_CHANGES_REVIEWED"
  | "RECOVERY_ACTIONS_REVIEWED"
  | "ESCALATION_REVIEWED"
  | "POSTMORTEM_REQUIRED";

export const CHECKLIST_ITEM_KEYS: ChecklistItemKey[] = [
  "COMMANDER_ASSIGNED",
  "TECHNICAL_LEAD_ASSIGNED",
  "COMMUNICATION_ASSESSED",
  "STAKEHOLDERS_NOTIFIED",
  "BLAST_RADIUS_REVIEWED",
  "RECENT_CHANGES_REVIEWED",
  "RECOVERY_ACTIONS_REVIEWED",
  "ESCALATION_REVIEWED",
  "POSTMORTEM_REQUIRED",
];

export interface ChecklistItem {
  key: ChecklistItemKey;
  status: ChecklistItemStatus;
  updatedBy: string | null;
  updatedAt: string | null;
}

export interface IncidentCommandState {
  roles: IncidentCommandRole[];
  checklist: ChecklistItem[];
  lastUpdatedAt: string | null;
}

// Der Rest des Overview-Payloads wird bewusst als "unknown-ish" typisiert
// (Record<string, unknown>-artig ueber gezielte optionale Felder), da er
// direkt die Formen bereits bestehender Endpunkte wiederverwendet
// (Escalation/Recovery/Communication/Postmortem/Timeline) - siehe
// api/incident-command.api.ts fuer die konkrete Nutzung im Frontend.
export interface CommandOverview {
  incident: {
    id: string;
    projectId: string;
    severity: string;
    title: string;
    resolved: boolean;
    createdAt: string;
    resolvedAt: string | null;
    acknowledgedAt: string | null;
    lastEscalatedStep: number;
  };
  command: IncidentCommandState;
  escalation: {
    policy: { id: number; name: string } | null;
    currentStepOrder: number;
    currentTarget: { stepOrder: number; targetType: string; userId: string | null; userName: string | null } | null;
    nextStep: { stepOrder: number; delayMinutes: number; dueAt: string } | null;
  };
  recovery: {
    service: { id: number; name: string; criticality: string } | null;
    recoveryActions: { rule: { id: string; name: string; action: string; riskLevel: string }; safety: { verdict: string; reason: string | null }; hasExecutor: boolean }[];
  };
  communications: {
    recent: { id: string; message: string; severity: string; targetType: string; createdAt: string }[];
    recommendations: { key: string; severity: string; title: string; message: string; reason: string }[];
  };
  changeIntelligence: {
    service: { id: number; name: string; criticality: string } | null;
    relevantChanges: { id: number; title: string; status: string; minutesBeforeIncident: number }[];
    relevantDeployments: { id: number; version: string; environment: string; status: string; minutesBeforeIncident: number }[];
    risk: { score: number; verdict: string; factors: { key: string; label: string; points: number; detail: string }[]; blockers: { key: string; label: string; detail: string }[] } | null;
  };
  impact: { affectedServiceCount: number; maxDepthReached: number; spofCount: number; hasCriticalPath: boolean } | null;
  postmortem: { exists: boolean; status: string | null; actionItemCount: number; openActionItemCount: number };
  timeline: { totalEvents: number; recent: { id: string; eventType: string; message: string; createdAt: string }[] };
  // Phase 35 "Enterprise Problem Management & Root-Cause Intelligence"
  // Auftragspunkt 15 "Command Center Integration".
  relatedProblems: { id: number; title: string; status: string; priority: string }[];
}
