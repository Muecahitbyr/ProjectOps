// Phase 26 "Enterprise Incident Postmortems & Retrospectives".
// Spiegelt src/types/postmortem.types.ts im Backend. Anders als bei
// Incident.id (siehe incident.types.ts) sind id/incidentId/postmortemId
// hier bewusst "number" statt "string" - das Backend-Repository
// (postmortems.repository.ts) konvertiert die BIGINT-Spalten explizit
// per Number(), die JSON-Antwort enthaelt also echte Zahlen.

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

export interface PostmortemWithActionItems extends IncidentPostmortem {
  actionItems: PostmortemActionItem[];
}

export const MAX_ACTION_ITEMS_PER_POSTMORTEM = 50;
