import { pool } from "./pool";
import type { Incident, IncidentSeverity } from "../types/incident.types";

interface IncidentRow {
  // BIGSERIAL - kommt vom pg-Treiber als String zurueck, siehe mapRow().
  // Phase 64 "Enterprise Operational Priority & Attention Management" -
  // live gefundener Bug: escalation_policy_id (BIGINT-FK) direkt darunter
  // wurde bereits korrekt konvertiert, id selbst (die BIGSERIAL-Spalte
  // dieser Tabelle) jedoch nicht - blieb bislang "still", weil kein
  // bestehender Aufrufer Incident.id gegen eine ANDERE, bereits korrekt
  // Number()-gewandelte Incident-Id verglich (z.B. via Set/Map, siehe
  // core/attention.ts's Duplikat-Erkennung ueber problems.repository.ts's
  // bereits korrekt gewandelte listRelatedIncidents()-Ergebnisse - genau
  // dort wurde der Bug erstmals sichtbar).
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
  // BIGINT - kommt vom pg-Treiber als String zurueck, siehe mapRow()
  // (Lehre aus Phase 25/26: neue BIGINT-Spalten immer explizit konvertieren).
  escalation_policy_id: string | number | null;
  // INTEGER (kein BIGINT) - kommt bereits als echte Zahl zurueck.
  last_escalated_step: number;
}

const INCIDENT_COLUMNS = `
  id, project_id, check_id, severity, title, description, resolved, created_at, resolved_at,
  acknowledged_at, acknowledged_by, assignee_id, resolution_reason,
  escalation_policy_id, last_escalated_step
`;

function toIsoOrNull(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function mapRow(row: IncidentRow): Incident {
  return {
    id: Number(row.id),
    projectId: row.project_id,
    checkId: row.check_id,
    severity: row.severity as IncidentSeverity,
    title: row.title,
    description: row.description,
    resolved: row.resolved,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    resolvedAt: toIsoOrNull(row.resolved_at),
    acknowledgedAt: toIsoOrNull(row.acknowledged_at),
    acknowledgedBy: row.acknowledged_by,
    assigneeId: row.assignee_id,
    resolutionReason: row.resolution_reason,
    escalationPolicyId: row.escalation_policy_id === null ? null : Number(row.escalation_policy_id),
    lastEscalatedStep: row.last_escalated_step,
  };
}

export interface OpenIncidentInput {
  projectId: string;
  checkId: string;
  severity: IncidentSeverity;
  title: string;
  description?: string;
  // Phase 27 "Enterprise On-Call & Escalation Management" - vom Aufrufer
  // (core/monitor.ts) ueber Projekt->Service aufgeloest und hier als
  // Snapshot festgehalten, siehe Migrationskommentar.
  escalationPolicyId?: number;
}

// Legt einen Incident an, sofern fuer diesen Check noch keiner offen ist
// (siehe idx_incidents_open_per_check). Gibt undefined zurueck, wenn bereits
// einer offen war - der Aufrufer soll dann keine erneute KI-Analyse ausloesen.
export async function openIncident(input: OpenIncidentInput): Promise<Incident | undefined> {
  const { rows } = await pool.query<IncidentRow>(
    `INSERT INTO incidents (project_id, check_id, severity, title, description, escalation_policy_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (check_id) WHERE resolved = false DO NOTHING
     RETURNING ${INCIDENT_COLUMNS}`,
    [input.projectId, input.checkId, input.severity, input.title, input.description ?? null, input.escalationPolicyId ?? null],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function getOpenIncident(checkId: string): Promise<Incident | undefined> {
  const { rows } = await pool.query<IncidentRow>(
    `SELECT ${INCIDENT_COLUMNS} FROM incidents WHERE check_id = $1 AND resolved = false LIMIT 1`,
    [checkId],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function resolveOpenIncident(checkId: string): Promise<Incident | undefined> {
  const { rows } = await pool.query<IncidentRow>(
    `UPDATE incidents
     SET resolved = true, resolved_at = now()
     WHERE check_id = $1 AND resolved = false
     RETURNING ${INCIDENT_COLUMNS}`,
    [checkId],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

// Phase 16 Auftragspunkt 4 "Tenant Isolation" - optionaler
// projectIds-Filter, additiv (bestehende Aufrufer ohne das Feld
// unveraendert). Notwendig fuer GET /api/v1/incidents
// (routes/v1/incidents.routes.ts): eine reine Nachfilterung im Route-
// Handler nach dem LIMIT wuerde bei vielen fremden Incidents faelschlich
// leere Ergebnisse liefern, obwohl echte Incidents der eigenen Organisation
// existieren - der Filter muss daher in der SQL-Abfrage selbst greifen.
// Phase 16 (2. Iteration) Auftragspunkt 12 "Pagination" - optionaler
// offset-Parameter, additiv (bestehende Aufrufer ohne das Feld
// unveraendert). Zusammen mit countIncidents() unten fuer echte
// Seitenzahlen auf GET /api/v1/incidents statt einer unkontrollierten
// SELECT *-Abfrage.
export async function getIncidents(
  options: { resolved?: boolean; limit?: number; offset?: number; projectIds?: string[] } = {},
): Promise<Incident[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (options.resolved !== undefined) {
    values.push(options.resolved);
    conditions.push(`resolved = $${values.length}`);
  }

  if (options.projectIds !== undefined) {
    values.push(options.projectIds);
    conditions.push(`project_id = ANY($${values.length})`);
  }

  values.push(options.limit ?? 100);
  const limitIndex = values.length;
  values.push(options.offset ?? 0);
  const offsetIndex = values.length;
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await pool.query<IncidentRow>(
    `SELECT ${INCIDENT_COLUMNS} FROM incidents ${where} ORDER BY created_at DESC LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    values,
  );
  return rows.map(mapRow);
}

export async function countIncidents(options: { resolved?: boolean; projectIds?: string[] } = {}): Promise<number> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (options.resolved !== undefined) {
    values.push(options.resolved);
    conditions.push(`resolved = $${values.length}`);
  }
  if (options.projectIds !== undefined) {
    values.push(options.projectIds);
    conditions.push(`project_id = ANY($${values.length})`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await pool.query<{ count: string }>(`SELECT COUNT(*) AS count FROM incidents ${where}`, values);
  return Number(rows[0]?.count ?? 0);
}

export async function getOpenIncidentsForProject(projectId: string): Promise<Incident[]> {
  const { rows } = await pool.query<IncidentRow>(
    `SELECT ${INCIDENT_COLUMNS} FROM incidents WHERE project_id = $1 AND resolved = false ORDER BY created_at DESC`,
    [projectId],
  );
  return rows.map(mapRow);
}

export async function getRecentIncidentsForProject(projectId: string, limit = 10): Promise<Incident[]> {
  const { rows } = await pool.query<IncidentRow>(
    `SELECT ${INCIDENT_COLUMNS} FROM incidents WHERE project_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [projectId, limit],
  );
  return rows.map(mapRow);
}

export async function getIncidentById(id: number): Promise<Incident | undefined> {
  const { rows } = await pool.query<IncidentRow>(`SELECT ${INCIDENT_COLUMNS} FROM incidents WHERE id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : undefined;
}

// Phase 21 Auftragspunkt 3 "Incident Lifecycle" - acknowledgen ist erlaubt,
// solange der Incident noch nicht geloest ist (ein geloester Incident wird
// nicht mehr "bestaetigt", nur noch ggf. reopened). Erneutes Acknowledgen
// durch denselben oder einen anderen Nutzer aendert acknowledged_by, ohne
// acknowledged_at zurueckzusetzen (WHERE acknowledged_at IS NULL) - die
// ERSTE Bestaetigung zaehlt fuer die Zeitmessung ("wie lange bis reagiert
// wurde"), spaeteres erneutes Draufklicken ist ein No-Op (idempotent).
// userId ist optional - bleibt null, wenn ueber die externe API von einem
// API-Key bestaetigt wird (keine Benutzer-Identitaet vorhanden, siehe
// routes/v1/incidents.routes.ts, das stattdessen actorApiKeyId in den
// Timeline-/Audit-Metadaten fuehrt - dasselbe Prinzip wie revokedBy bei
// API-Keys, Phase 20).
export async function acknowledgeIncident(id: number, userId?: string): Promise<Incident | undefined> {
  const { rows } = await pool.query<IncidentRow>(
    `UPDATE incidents SET acknowledged_at = now(), acknowledged_by = $2
     WHERE id = $1 AND resolved = false AND acknowledged_at IS NULL
     RETURNING ${INCIDENT_COLUMNS}`,
    [id, userId ?? null],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

// Manuelles/API-getriebenes Resolve EINES bestimmten Incidents (per id) -
// im Unterschied zu resolveOpenIncident() oben, das ueber check_id aufgeloest
// wird (automatische Wiederherstellung durch core/monitor.ts). Beide
// schreiben auf dieselben Spalten (resolved/resolved_at), daher bleibt
// idx_incidents_open_per_check weiterhin die einzige Wahrheitsquelle fuer
// "offen" unabhaengig vom Ausloeser.
export async function resolveIncidentById(id: number, reason?: string): Promise<Incident | undefined> {
  const { rows } = await pool.query<IncidentRow>(
    `UPDATE incidents SET resolved = true, resolved_at = now(), resolution_reason = COALESCE($2, resolution_reason)
     WHERE id = $1 AND resolved = false
     RETURNING ${INCIDENT_COLUMNS}`,
    [id, reason ?? null],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

// Auftragspunkt 3 "reopen" - setzt sowohl resolved als auch acknowledged
// zurueck (der wiederkehrende Fehler muss erneut bestaetigt werden). Race
// Condition: falls in der Zwischenzeit (waehrend der Incident resolved war)
// bereits ein NEUER offener Incident fuer denselben check_id entstanden ist
// (monitor.ts erkennt den Ausfall unabhaengig erneut), wuerde das Reopen
// gegen idx_incidents_open_per_check verstossen (zwei offene Zeilen fuer
// denselben Check). Postgres lehnt das mit Fehlercode 23505 ab - wird hier
// explizit abgefangen und als "Konflikt" (kein Absturz) an den Aufrufer
// durchgereicht, statt den ganzen Request mit einer unbehandelten
// Exception abzubrechen.
export async function reopenIncident(id: number): Promise<Incident | undefined | "CONFLICT"> {
  try {
    const { rows } = await pool.query<IncidentRow>(
      `UPDATE incidents SET resolved = false, resolved_at = NULL, acknowledged_at = NULL, acknowledged_by = NULL
       WHERE id = $1 AND resolved = true
       RETURNING ${INCIDENT_COLUMNS}`,
      [id],
    );
    return rows[0] ? mapRow(rows[0]) : undefined;
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && (err as { code: string }).code === "23505") {
      return "CONFLICT";
    }
    throw err;
  }
}

export async function assignIncident(id: number, assigneeId: string | null): Promise<Incident | undefined> {
  const { rows } = await pool.query<IncidentRow>(
    `UPDATE incidents SET assignee_id = $2 WHERE id = $1 RETURNING ${INCIDENT_COLUMNS}`,
    [id, assigneeId],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

// Phase 27 "Enterprise On-Call & Escalation Management" - Kandidaten fuer
// core/incident-escalation.ts, EINE Abfrage fuer den gesamten Scheduler-Tick
// (nutzt idx_incidents_escalation_due) statt einer Abfrage pro Projekt/
// Incident. acknowledged_at IS NULL im WHERE selbst genuegt bereits, um
// Auftragspunkt 5 ("nach Acknowledge keine weitere Eskalation") zu erfuellen -
// kein zusaetzlicher Code noetig, das bestehende Acknowledge (Phase 21)
// setzt exakt diese Spalte.
export async function listIncidentsDueForEscalationCheck(): Promise<Incident[]> {
  const { rows } = await pool.query<IncidentRow>(
    `SELECT ${INCIDENT_COLUMNS} FROM incidents
     WHERE escalation_policy_id IS NOT NULL AND resolved = false AND acknowledged_at IS NULL`,
  );
  return rows.map(mapRow);
}

// Compare-and-swap: schaltet last_escalated_step nur weiter, wenn er noch
// exakt expectedPreviousStep ist UND der Incident zwischenzeitlich nicht
// acknowledged/resolved wurde. Genau EIN gleichzeitiger Aufruf (z.B. bei
// einer versehentlich doppelt laufenden Auswertung) gewinnt - alle anderen
// erhalten undefined zurueck und loesen keine zweite Benachrichtigung aus
// (siehe core/incident-escalation.ts).
export async function markIncidentEscalationStepFired(
  id: number,
  expectedPreviousStep: number,
  newStep: number,
): Promise<Incident | undefined> {
  const { rows } = await pool.query<IncidentRow>(
    `UPDATE incidents SET last_escalated_step = $3
     WHERE id = $1 AND last_escalated_step = $2 AND resolved = false AND acknowledged_at IS NULL
     RETURNING ${INCIDENT_COLUMNS}`,
    [id, expectedPreviousStep, newStep],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}
