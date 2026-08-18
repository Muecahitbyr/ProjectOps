import { pool } from "./pool";
import type { Incident, IncidentSeverity } from "../types/incident.types";
import type { RootIncident } from "../types/root-incident.types";

interface RootIncidentRow {
  // BIGSERIAL - kommt vom pg-Treiber als String zurueck. Phase 65
  // "Enterprise Platform Consolidation & Final Gap Analysis" - live
  // gefundener Bug: dieselbe unkonvertierte-BIGSERIAL-Problematik wie in
  // db/incidents.repository.ts (dort bereits behoben), hier eine zweite,
  // unabhaengige Kopie derselben incidents-Tabellen-Zuordnung (mapIncidentRow
  // unten) plus die eigene root_incidents.id - beide bislang nie
  // Number()-gewandelt.
  id: string | number;
  title: string;
  cause_check_type: string;
  started_at: string | Date;
  resolved_at: string | Date | null;
  created_at: string | Date;
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}
function toIsoStringOrNull(value: string | Date | null): string | null {
  return value === null ? null : toIsoString(value);
}

export interface CandidateIncidentRow {
  incident_id: number;
  project_id: string;
  check_type: string;
  created_at: string;
}

// Kandidaten fuer eine Korrelation: aktuell offene Incidents, die noch
// keinem Root Incident zugeordnet sind, gruppiert nach Check-Typ (die
// "gleiche Fehlerquelle"). alerts/incident-correlation.ts entscheidet
// anhand von Zeitfenster + Mindestanzahl unterschiedlicher Projekte, ob eine
// Gruppe tatsaechlich korreliert wird.
export async function getUncorrelatedOpenIncidents(): Promise<CandidateIncidentRow[]> {
  const { rows } = await pool.query<{ incident_id: number; project_id: string; check_type: string; created_at: string | Date }>(
    `SELECT i.id AS incident_id, i.project_id, c.type AS check_type, i.created_at
     FROM incidents i
     JOIN checks c ON c.id = i.check_id
     WHERE i.resolved = false AND i.root_incident_id IS NULL
     ORDER BY c.type, i.created_at`,
  );
  return rows.map((row) => ({ ...row, created_at: toIsoString(row.created_at) }));
}

export async function getOpenRootIncidentForCheckType(causeCheckType: string): Promise<RootIncident | undefined> {
  const { rows } = await pool.query<RootIncidentRow>(
    `SELECT id, title, cause_check_type, started_at, resolved_at, created_at
     FROM root_incidents
     WHERE cause_check_type = $1 AND resolved_at IS NULL
     ORDER BY started_at DESC LIMIT 1`,
    [causeCheckType],
  );
  const row = rows[0];
  if (!row) return undefined;
  return {
    id: Number(row.id),
    title: row.title,
    causeCheckType: row.cause_check_type,
    startedAt: toIsoString(row.started_at),
    resolvedAt: toIsoStringOrNull(row.resolved_at),
    createdAt: toIsoString(row.created_at),
    affectedProjectIds: [],
    incidents: [],
  };
}

export async function createRootIncident(title: string, causeCheckType: string, startedAt: string): Promise<number> {
  const { rows } = await pool.query<{ id: string | number }>(
    `INSERT INTO root_incidents (title, cause_check_type, started_at) VALUES ($1, $2, $3) RETURNING id`,
    [title, causeCheckType, startedAt],
  );
  const id = rows[0]?.id;
  if (id === undefined) {
    throw new Error("Root Incident konnte nicht angelegt werden");
  }
  return Number(id);
}

export async function linkIncidentsToRootIncident(rootIncidentId: number, incidentIds: number[]): Promise<void> {
  if (incidentIds.length === 0) return;
  await pool.query(`UPDATE incidents SET root_incident_id = $1 WHERE id = ANY($2::bigint[])`, [
    rootIncidentId,
    incidentIds,
  ]);
}

// Ein Root Incident gilt als geloest, sobald keiner seiner verknuepften
// Incidents mehr offen ist - kein separater Zustand, den man vergessen
// koennte manuell zu pflegen.
export async function resolveCompletedRootIncidents(): Promise<number[]> {
  const { rows } = await pool.query<{ id: string | number }>(
    `UPDATE root_incidents
     SET resolved_at = now()
     WHERE resolved_at IS NULL
       AND id IN (
         SELECT root_incident_id FROM incidents
         WHERE root_incident_id IS NOT NULL
         GROUP BY root_incident_id
         HAVING COUNT(*) FILTER (WHERE resolved = false) = 0
       )
     RETURNING id`,
  );
  return rows.map((row) => Number(row.id));
}

interface IncidentRow {
  // BIGSERIAL - siehe Kommentar bei RootIncidentRow.id oben.
  id: string | number;
  project_id: string;
  check_id: string;
  severity: string;
  title: string;
  description: string | null;
  resolved: boolean;
  created_at: string | Date;
  resolved_at: string | Date | null;
  acknowledged_at: string | Date | null;
  acknowledged_by: string | null;
  assignee_id: string | null;
  resolution_reason: string | null;
  escalation_policy_id: string | number | null;
  last_escalated_step: number;
}

// Phase 21 Auftragspunkt 3 "Incident Lifecycle" - um acknowledged_at/
// acknowledged_by/assignee_id/resolution_reason ergaenzt (Migration 0041),
// damit Root-Incident-Detailansichten dieselben Lifecycle-Felder zeigen wie
// jede andere Incident-Abfrage (db/incidents.repository.ts).
function mapIncidentRow(row: IncidentRow): Incident {
  return {
    id: Number(row.id),
    projectId: row.project_id,
    checkId: row.check_id,
    severity: row.severity as IncidentSeverity,
    title: row.title,
    description: row.description,
    resolved: row.resolved,
    createdAt: toIsoString(row.created_at),
    resolvedAt: toIsoStringOrNull(row.resolved_at),
    acknowledgedAt: toIsoStringOrNull(row.acknowledged_at),
    acknowledgedBy: row.acknowledged_by,
    assigneeId: row.assignee_id,
    resolutionReason: row.resolution_reason,
    escalationPolicyId: row.escalation_policy_id === null ? null : Number(row.escalation_policy_id),
    lastEscalatedStep: row.last_escalated_step,
  };
}

export async function listRootIncidents(limit = 50): Promise<RootIncident[]> {
  const { rows: rootRows } = await pool.query<RootIncidentRow>(
    `SELECT id, title, cause_check_type, started_at, resolved_at, created_at
     FROM root_incidents ORDER BY started_at DESC LIMIT $1`,
    [limit],
  );
  if (rootRows.length === 0) return [];

  const ids = rootRows.map((row) => row.id);
  const { rows: incidentRows } = await pool.query<IncidentRow & { root_incident_id: string | number }>(
    `SELECT id, project_id, check_id, severity, title, description, resolved, created_at, resolved_at,
            acknowledged_at, acknowledged_by, assignee_id, resolution_reason,
            escalation_policy_id, last_escalated_step, root_incident_id
     FROM incidents WHERE root_incident_id = ANY($1::bigint[]) ORDER BY created_at`,
    [ids],
  );

  // Phase 65: byRoot ist jetzt konsistent auf echten Number()-Schluesseln
  // aufgebaut (statt beidseitig unkonvertierten Strings, die nur zufaellig
  // uebereinstimmten) - derselbe Fix wie oben.
  const byRoot = new Map<number, Incident[]>();
  for (const row of incidentRows) {
    const key = Number(row.root_incident_id);
    const list = byRoot.get(key) ?? [];
    list.push(mapIncidentRow(row));
    byRoot.set(key, list);
  }

  return rootRows.map((row) => {
    const incidents = byRoot.get(Number(row.id)) ?? [];
    return {
      id: Number(row.id),
      title: row.title,
      causeCheckType: row.cause_check_type,
      startedAt: toIsoString(row.started_at),
      resolvedAt: toIsoStringOrNull(row.resolved_at),
      createdAt: toIsoString(row.created_at),
      affectedProjectIds: [...new Set(incidents.map((incident) => incident.projectId))],
      incidents,
    };
  });
}
