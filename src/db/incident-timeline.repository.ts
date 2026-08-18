import { pool } from "./pool";
import type { IncidentTimelineEvent, IncidentTimelineEventType } from "../types/incident.types";

interface IncidentTimelineEventRow {
  id: number;
  incident_id: number;
  event_type: string;
  message: string;
  metadata: Record<string, unknown> | null;
  actor_user_id: string | null;
  created_at: string | Date;
}

const COLUMNS = `id, incident_id, event_type, message, metadata, actor_user_id, created_at`;

function mapRow(row: IncidentTimelineEventRow): IncidentTimelineEvent {
  return {
    id: row.id,
    incidentId: row.incident_id,
    eventType: row.event_type as IncidentTimelineEventType,
    message: row.message,
    metadata: row.metadata,
    actorUserId: row.actor_user_id,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

export interface AddTimelineEventInput {
  incidentId: number;
  eventType: IncidentTimelineEventType;
  message: string;
  metadata?: Record<string, unknown>;
  actorUserId?: string;
}

// Phase 21 Auftragspunkt 4 "Incident Timeline" - EIN Einfuegepunkt fuer alle
// Aufrufer (core/monitor.ts, automation/execution-runner.ts, routes/
// incidents.routes.ts, routes/v1/incidents.routes.ts). Bewusst KEIN Wurf bei
// Fehlern nach aussen - ein fehlgeschlagener Timeline-Eintrag darf niemals
// die eigentliche Aktion (Incident anlegen/bestaetigen/loesen, Automation
// ausfuehren) verhindern; Aufrufer nutzen `void addTimelineEvent(...)` oder
// fangen selbst ab, je nachdem ob der Aufrufkontext bereits einen eigenen
// try/catch besitzt.
export async function addTimelineEvent(input: AddTimelineEventInput): Promise<IncidentTimelineEvent> {
  const { rows } = await pool.query<IncidentTimelineEventRow>(
    `INSERT INTO incident_timeline_events (incident_id, event_type, message, metadata, actor_user_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${COLUMNS}`,
    [input.incidentId, input.eventType, input.message, input.metadata ? JSON.stringify(input.metadata) : null, input.actorUserId ?? null],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Timeline-Eintrag konnte nicht gespeichert werden");
  }
  return mapRow(row);
}

export async function getIncidentTimeline(incidentId: number): Promise<IncidentTimelineEvent[]> {
  const { rows } = await pool.query<IncidentTimelineEventRow>(
    `SELECT ${COLUMNS} FROM incident_timeline_events WHERE incident_id = $1 ORDER BY created_at ASC`,
    [incidentId],
  );
  return rows.map(mapRow);
}
