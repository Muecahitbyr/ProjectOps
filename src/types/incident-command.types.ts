// Phase 32 "Enterprise Incident Command Center & Operational Coordination".
export type IncidentCommandRoleType = "INCIDENT_COMMANDER" | "TECHNICAL_LEAD" | "COMMUNICATIONS_LEAD";
export const INCIDENT_COMMAND_ROLE_TYPES: IncidentCommandRoleType[] = ["INCIDENT_COMMANDER", "TECHNICAL_LEAD", "COMMUNICATIONS_LEAD"];

export interface IncidentCommandRole {
  id: number;
  incidentId: number;
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

// Reihenfolge = Anzeigereihenfolge im Frontend.
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
