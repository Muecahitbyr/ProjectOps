// Phase 26 "Enterprise Incident Postmortems & Retrospectives".
// Spiegelt db/migrations/0047_incident_postmortems.sql.

export type PostmortemStatus = "DRAFT" | "IN_REVIEW" | "PUBLISHED";
export const POSTMORTEM_STATUSES: PostmortemStatus[] = ["DRAFT", "IN_REVIEW", "PUBLISHED"];

export type ActionItemStatus = "OPEN" | "IN_PROGRESS" | "DONE";
export const ACTION_ITEM_STATUSES: ActionItemStatus[] = ["OPEN", "IN_PROGRESS", "DONE"];

export interface IncidentPostmortem {
  id: number;
  incidentId: number;
  status: PostmortemStatus;
  summary: string | null;
  impact: string | null;
  rootCause: string | null;
  resolution: string | null;
  timelineNotes: string | null;
  createdBy: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PostmortemActionItem {
  id: number;
  postmortemId: number;
  description: string;
  assigneeId: string | null;
  dueDate: string | null;
  status: ActionItemStatus;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

// Auftragspunkt "vollstaendig produktionsreif" - je Postmortem-Antwort
// direkt die Action Items mitliefern (keine zweite Anfrage fuer die
// ueberwiegende Mehrheit der Aufrufer, die ohnehin beides gleichzeitig
// brauchen, z.B. die Incident-Detailseite).
export interface PostmortemWithActionItems extends IncidentPostmortem {
  actionItems: PostmortemActionItem[];
}

export const MAX_ACTION_ITEMS_PER_POSTMORTEM = 50;
