import { pool } from "./pool";
import type { Problem, ProblemChangeLink, ProblemIncidentLink, ProblemPriority, ProblemStatus, ProblemRelatedIncident, ProblemRelatedChange } from "../types/problem.types";

interface ProblemRow {
  id: number;
  organization_id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  owner_user_id: string | null;
  root_cause: string | null;
  workaround: string | null;
  remediation: string | null;
  created_by: string | null;
  created_at: string | Date;
  updated_at: string | Date;
  resolved_at: string | Date | null;
}

const PROBLEM_COLUMNS = `
  id, organization_id, title, description, status, priority, owner_user_id,
  root_cause, workaround, remediation, created_by, created_at, updated_at, resolved_at
`;

const PROBLEM_COLUMNS_PREFIXED = `
  p.id, p.organization_id, p.title, p.description, p.status, p.priority, p.owner_user_id,
  p.root_cause, p.workaround, p.remediation, p.created_by, p.created_at, p.updated_at, p.resolved_at
`;

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function mapRow(row: ProblemRow): Problem {
  return {
    id: Number(row.id),
    organizationId: row.organization_id,
    title: row.title,
    description: row.description,
    status: row.status as ProblemStatus,
    priority: row.priority as ProblemPriority,
    ownerUserId: row.owner_user_id,
    rootCause: row.root_cause,
    workaround: row.workaround,
    remediation: row.remediation,
    createdBy: row.created_by,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    resolvedAt: row.resolved_at ? toIso(row.resolved_at) : null,
  };
}

export interface CreateProblemInput {
  organizationId: string;
  title: string;
  description?: string | null;
  status?: ProblemStatus;
  priority?: ProblemPriority;
  ownerUserId?: string | null;
  rootCause?: string | null;
  workaround?: string | null;
  remediation?: string | null;
  createdBy?: string | null;
}

export interface UpdateProblemInput {
  title?: string;
  description?: string | null;
  status?: ProblemStatus;
  priority?: ProblemPriority;
  ownerUserId?: string | null;
  rootCause?: string | null;
  workaround?: string | null;
  remediation?: string | null;
}

export interface ListProblemsFilter {
  organizationId?: string;
  status?: ProblemStatus;
  priority?: ProblemPriority;
  ownerUserId?: string;
  // Phase 64 "Enterprise Operational Priority & Attention Management" -
  // additiv, bestehende Aufrufer ohne dieses Feld unveraendert. Noetig fuer
  // die org-weite Attention-List (core/attention.ts), die - anders als die
  // bisherigen Aufrufer dieser Funktion (immer bereits durch organizationId+
  // status+priority stark eingeschraenkt) - ALLE offenen Probleme als
  // Kandidaten braucht, bevor sie nach Tier sortiert und auf die
  // eigentliche Ausgabegroesse gekuerzt werden (dasselbe "billige
  // Vorsortierung, dann Top-N"-Muster wie ueberall sonst in diesem System).
  limit?: number;
}

export async function createProblem(input: CreateProblemInput): Promise<Problem> {
  const { rows } = await pool.query<ProblemRow>(
    `INSERT INTO problems (organization_id, title, description, status, priority, owner_user_id, root_cause, workaround, remediation, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING ${PROBLEM_COLUMNS}`,
    [
      input.organizationId,
      input.title,
      input.description ?? null,
      input.status ?? "OPEN",
      input.priority ?? "MEDIUM",
      input.ownerUserId ?? null,
      input.rootCause ?? null,
      input.workaround ?? null,
      input.remediation ?? null,
      input.createdBy ?? null,
    ],
  );
  const row = rows[0];
  if (!row) throw new Error("Problem konnte nicht angelegt werden");
  return mapRow(row);
}

export async function getProblemById(id: number): Promise<Problem | undefined> {
  const { rows } = await pool.query<ProblemRow>(`SELECT ${PROBLEM_COLUMNS} FROM problems WHERE id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function getProblemOrganizationId(id: number): Promise<string | undefined> {
  const { rows } = await pool.query<{ organization_id: string }>(`SELECT organization_id FROM problems WHERE id = $1`, [id]);
  return rows[0]?.organization_id;
}

export async function listProblems(filter: ListProblemsFilter = {}): Promise<Problem[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (filter.organizationId) {
    values.push(filter.organizationId);
    conditions.push(`organization_id = $${values.length}`);
  }
  if (filter.status) {
    values.push(filter.status);
    conditions.push(`status = $${values.length}`);
  }
  if (filter.priority) {
    values.push(filter.priority);
    conditions.push(`priority = $${values.length}`);
  }
  if (filter.ownerUserId) {
    values.push(filter.ownerUserId);
    conditions.push(`owner_user_id = $${values.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  let limitClause = "";
  if (filter.limit !== undefined) {
    values.push(filter.limit);
    limitClause = ` LIMIT $${values.length}`;
  }
  const { rows } = await pool.query<ProblemRow>(`SELECT ${PROBLEM_COLUMNS} FROM problems ${where} ORDER BY created_at DESC${limitClause}`, values);
  return rows.map(mapRow);
}

// Auftragspunkt 4 "Problem-Modell" - resolved_at wird automatisch gesetzt/
// geloescht, sobald status auf RESOLVED/CLOSED wechselt bzw. wieder
// verlaesst (derselbe Ansatz wie incidents.resolved_at, aber hier ueber
// einen expliziten Statuswert statt eines Booleans gesteuert, da Problem
// sechs Zustaende statt zwei kennt).
const TERMINAL_STATUSES: ProblemStatus[] = ["RESOLVED", "CLOSED"];

export async function updateProblem(id: number, input: UpdateProblemInput): Promise<Problem | undefined> {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (input.title !== undefined) {
    values.push(input.title);
    sets.push(`title = $${values.length}`);
  }
  if (input.description !== undefined) {
    values.push(input.description);
    sets.push(`description = $${values.length}`);
  }
  if (input.status !== undefined) {
    values.push(input.status);
    sets.push(`status = $${values.length}`);
    if (TERMINAL_STATUSES.includes(input.status)) {
      sets.push(`resolved_at = COALESCE(resolved_at, now())`);
    } else {
      sets.push(`resolved_at = NULL`);
    }
  }
  if (input.priority !== undefined) {
    values.push(input.priority);
    sets.push(`priority = $${values.length}`);
  }
  if (input.ownerUserId !== undefined) {
    values.push(input.ownerUserId);
    sets.push(`owner_user_id = $${values.length}`);
  }
  if (input.rootCause !== undefined) {
    values.push(input.rootCause);
    sets.push(`root_cause = $${values.length}`);
  }
  if (input.workaround !== undefined) {
    values.push(input.workaround);
    sets.push(`workaround = $${values.length}`);
  }
  if (input.remediation !== undefined) {
    values.push(input.remediation);
    sets.push(`remediation = $${values.length}`);
  }
  if (sets.length === 0) return getProblemById(id);
  sets.push(`updated_at = now()`);
  values.push(id);
  const { rows } = await pool.query<ProblemRow>(
    `UPDATE problems SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING ${PROBLEM_COLUMNS}`,
    values,
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function deleteProblem(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM problems WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Auftragspunkt 5 "Problem <-> Incident Relation"
// ---------------------------------------------------------------------------

interface ProblemIncidentRow {
  id: number;
  problem_id: number;
  incident_id: number;
  created_by: string | null;
  created_at: string | Date;
}

function mapIncidentLinkRow(row: ProblemIncidentRow): ProblemIncidentLink {
  return {
    id: Number(row.id),
    problemId: Number(row.problem_id),
    incidentId: Number(row.incident_id),
    createdBy: row.created_by,
    createdAt: toIso(row.created_at),
  };
}

// ON CONFLICT DO NOTHING statt einer vorherigen SELECT-Pruefung - die
// UNIQUE(problem_id, incident_id)-Constraint (Migration 0057) serialisiert
// gleichzeitige Verknuepfungsversuche bereits auf DB-Ebene (Auftragspunkt 28
// "Race Safety" - kein doppeltes Linking durch eine Race Condition
// moeglich), exakt dasselbe Muster wie createPostmortemIfNotExists().
export async function linkIncident(problemId: number, incidentId: number, createdBy: string | null): Promise<ProblemIncidentLink | null> {
  const { rows } = await pool.query<ProblemIncidentRow>(
    `INSERT INTO problem_incidents (problem_id, incident_id, created_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (problem_id, incident_id) DO NOTHING
     RETURNING id, problem_id, incident_id, created_by, created_at`,
    [problemId, incidentId, createdBy],
  );
  return rows[0] ? mapIncidentLinkRow(rows[0]) : null;
}

export async function unlinkIncident(problemId: number, incidentId: number): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM problem_incidents WHERE problem_id = $1 AND incident_id = $2`, [problemId, incidentId]);
  return (rowCount ?? 0) > 0;
}

export async function isIncidentLinked(problemId: number, incidentId: number): Promise<boolean> {
  const { rows } = await pool.query(`SELECT 1 FROM problem_incidents WHERE problem_id = $1 AND incident_id = $2`, [problemId, incidentId]);
  return rows.length > 0;
}

export async function listRelatedIncidents(problemId: number): Promise<ProblemRelatedIncident[]> {
  const { rows } = await pool.query<{
    id: number;
    project_id: string;
    check_id: string;
    title: string;
    severity: string;
    resolved: boolean;
    created_at: string | Date;
    resolved_at: string | Date | null;
  }>(
    `SELECT i.id, i.project_id, i.check_id, i.title, i.severity, i.resolved, i.created_at, i.resolved_at
     FROM problem_incidents pi
     JOIN incidents i ON i.id = pi.incident_id
     WHERE pi.problem_id = $1
     ORDER BY i.created_at DESC`,
    [problemId],
  );
  return rows.map((row) => ({
    id: Number(row.id),
    projectId: row.project_id,
    checkId: row.check_id,
    title: row.title,
    severity: row.severity as ProblemRelatedIncident["severity"],
    resolved: row.resolved,
    createdAt: toIso(row.created_at),
    resolvedAt: row.resolved_at ? toIso(row.resolved_at) : null,
  }));
}

// Auftragspunkt 6 "Root Cause" - "System kann moegliche Korrelationen
// anzeigen" - dieselbe Zeitfenster-Join-Logik wie Phase 33s org-weite
// Change-Korrelation (changes -> change_services -> services -> incidents),
// hier bewusst auf die KONKRETEN, bereits verknuepften Incidents EINES
// Problems eingeschraenkt statt einer zweiten, allgemeinen Aggregations-
// Engine. Ergebnis wird von core/problem-management.ts NIE als bestaetigte
// Root Cause dargestellt, nur als "moegliche Korrelation".
export interface CorrelatedChangeForIncidents {
  changeId: number;
  changeTitle: string;
  correlatedIncidentCount: number;
}

export async function getCorrelatedChangesForIncidents(incidentIds: number[], windowMinutes: number): Promise<CorrelatedChangeForIncidents[]> {
  if (incidentIds.length === 0) return [];
  const { rows } = await pool.query<{ change_id: number; change_title: string; correlated_incident_count: string }>(
    `SELECT ch.id AS change_id, ch.title AS change_title, COUNT(DISTINCT i.id) AS correlated_incident_count
     FROM changes ch
     JOIN change_services cs ON cs.change_id = ch.id
     JOIN services s ON s.id = cs.service_id AND s.project_id IS NOT NULL
     JOIN incidents i ON i.project_id = s.project_id AND i.id = ANY($1::bigint[])
       AND i.created_at >= COALESCE(ch.actual_start_at, ch.planned_start_at, ch.created_at)
       AND i.created_at < COALESCE(ch.actual_start_at, ch.planned_start_at, ch.created_at) + ($2 || ' minutes')::interval
     GROUP BY ch.id, ch.title
     ORDER BY correlated_incident_count DESC
     LIMIT 5`,
    [incidentIds, windowMinutes],
  );
  return rows.map((row) => ({ changeId: Number(row.change_id), changeTitle: row.change_title, correlatedIncidentCount: Number(row.correlated_incident_count) }));
}

// Auftragspunkt 23 "Problem Overview" - EINE gruppierte Abfrage fuer die
// Executive-Summary-Kacheln statt volle Problem-Zeilen zu laden.
export interface ProblemStatusCounts {
  open: number;
  investigating: number;
  knownError: number;
  mitigated: number;
  resolved: number;
  closed: number;
  criticalCount: number;
}

export async function countProblemsByStatus(organizationId: string): Promise<ProblemStatusCounts> {
  const { rows } = await pool.query<{ status: string; priority: string; count: string }>(
    `SELECT status, priority, COUNT(*) AS count FROM problems WHERE organization_id = $1 GROUP BY status, priority`,
    [organizationId],
  );
  const counts: ProblemStatusCounts = { open: 0, investigating: 0, knownError: 0, mitigated: 0, resolved: 0, closed: 0, criticalCount: 0 };
  for (const row of rows) {
    const count = Number(row.count);
    if (row.priority === "CRITICAL") counts.criticalCount += count;
    switch (row.status) {
      case "OPEN": counts.open += count; break;
      case "INVESTIGATING": counts.investigating += count; break;
      case "KNOWN_ERROR": counts.knownError += count; break;
      case "MITIGATED": counts.mitigated += count; break;
      case "RESOLVED": counts.resolved += count; break;
      case "CLOSED": counts.closed += count; break;
    }
  }
  return counts;
}

// Auftragspunkt 11 "Problem Candidates" - fuer welche check_id existiert
// bereits ein NICHT abgeschlossenes Problem (Batch, ein Aufruf fuer ALLE
// Kandidaten statt einer Abfrage pro Kandidat).
export async function getCheckIdsWithOpenProblem(organizationId: string): Promise<Set<string>> {
  const { rows } = await pool.query<{ check_id: string }>(
    `SELECT DISTINCT i.check_id
     FROM problem_incidents pi
     JOIN problems p ON p.id = pi.problem_id
     JOIN incidents i ON i.id = pi.incident_id
     WHERE p.organization_id = $1 AND p.status NOT IN ('RESOLVED', 'CLOSED')`,
    [organizationId],
  );
  return new Set(rows.map((row) => row.check_id));
}

// Auftragspunkt 19 "Command Center Integration" - die umgekehrte Richtung:
// welche Probleme sind mit EINEM Incident verknuepft (fuer
// core/incident-command.ts#buildCommandOverview).
export async function listProblemsForIncident(incidentId: number): Promise<Problem[]> {
  const { rows } = await pool.query<ProblemRow>(
    // Alphabetische Sortierung von "priority" waere fachlich falsch
    // (CRITICAL < HIGH < LOW < MEDIUM alphabetisch) - stattdessen ueber eine
    // explizite CASE-Rangfolge sortiert, dasselbe Prinzip wie die Severity-
    // Sortierung an anderer Stelle in dieser Codebase.
    `SELECT ${PROBLEM_COLUMNS_PREFIXED}
     FROM problem_incidents pi
     JOIN problems p ON p.id = pi.problem_id
     WHERE pi.incident_id = $1
     ORDER BY CASE p.priority WHEN 'CRITICAL' THEN 4 WHEN 'HIGH' THEN 3 WHEN 'MEDIUM' THEN 2 ELSE 1 END DESC, p.created_at DESC`,
    [incidentId],
  );
  return rows.map(mapRow);
}

// Batch-Variante von listProblemsForIncident() - fuer Auftragspunkt 27
// "Performance"/"kein N+1": die Reliability-/Command-Uebersicht darf nicht
// eine Abfrage PRO Incident ausloesen, wenn mehrere Incidents auf einmal
// aufgeloest werden muessen.
export async function getProblemCountsForIncidents(incidentIds: number[]): Promise<Map<number, number>> {
  if (incidentIds.length === 0) return new Map();
  const { rows } = await pool.query<{ incident_id: number; count: string }>(
    `SELECT incident_id, COUNT(*) AS count FROM problem_incidents WHERE incident_id = ANY($1::bigint[]) GROUP BY incident_id`,
    [incidentIds],
  );
  return new Map(rows.map((row) => [Number(row.incident_id), Number(row.count)]));
}

// ---------------------------------------------------------------------------
// Auftragspunkt 9 "Problem <-> Change"
// ---------------------------------------------------------------------------

interface ProblemChangeRow {
  id: number;
  problem_id: number;
  change_id: number;
  created_by: string | null;
  created_at: string | Date;
}

function mapChangeLinkRow(row: ProblemChangeRow): ProblemChangeLink {
  return {
    id: Number(row.id),
    problemId: Number(row.problem_id),
    changeId: Number(row.change_id),
    createdBy: row.created_by,
    createdAt: toIso(row.created_at),
  };
}

export async function linkChange(problemId: number, changeId: number, createdBy: string | null): Promise<ProblemChangeLink | null> {
  const { rows } = await pool.query<ProblemChangeRow>(
    `INSERT INTO problem_changes (problem_id, change_id, created_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (problem_id, change_id) DO NOTHING
     RETURNING id, problem_id, change_id, created_by, created_at`,
    [problemId, changeId, createdBy],
  );
  return rows[0] ? mapChangeLinkRow(rows[0]) : null;
}

export async function unlinkChange(problemId: number, changeId: number): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM problem_changes WHERE problem_id = $1 AND change_id = $2`, [problemId, changeId]);
  return (rowCount ?? 0) > 0;
}

// Phase 36 "Enterprise Remediation & Change Effectiveness Intelligence" -
// Tenant-/Relations-Pruefung fuer GET /problems/:id/effectiveness/:changeId:
// ein Change darf nur analysiert werden, wenn er TATSAECHLICH mit diesem
// Problem verknuepft ist (verhindert, dass ein fremder, unverknuepfter oder
// organisationsfremder Change ueber die changeId einfach durchgereicht wird).
export async function isChangeLinkedToProblem(problemId: number, changeId: number): Promise<boolean> {
  const { rows } = await pool.query(`SELECT 1 FROM problem_changes WHERE problem_id = $1 AND change_id = $2`, [problemId, changeId]);
  return rows.length > 0;
}

export async function listRelatedChanges(problemId: number): Promise<ProblemRelatedChange[]> {
  const { rows } = await pool.query<{ id: number; title: string; status: string; risk: string }>(
    `SELECT c.id, c.title, c.status, c.risk
     FROM problem_changes pc
     JOIN changes c ON c.id = pc.change_id
     WHERE pc.problem_id = $1
     ORDER BY c.created_at DESC`,
    [problemId],
  );
  return rows.map((row) => ({ id: Number(row.id), title: row.title, status: row.status, risk: row.risk }));
}

// ---------------------------------------------------------------------------
// Auftragspunkt 12 "Problem Impact" - reine Aggregation, keine neue
// Incident-Engine. CTE trennt die Incident-Aggregation von der Service-
// Aufloesung bewusst in zwei Schritte (siehe Kommentar unten) statt eines
// einzelnen JOINs - ein direkter JOIN incidents<->services ueber project_id
// wuerde Zeilen vervielfachen (mehrere Services koennen theoretisch
// denselben project_id haben) und SUM/AVG der Incident-Dauer verfaelschen.
// ---------------------------------------------------------------------------

export interface ProblemImpactRaw {
  incidentCount: number;
  highCriticalIncidentCount: number;
  affectedProjectIds: string[];
  totalIncidentDurationSeconds: number | null;
  avgMttrSeconds: number | null;
  firstIncidentAt: string | null;
  lastIncidentAt: string | null;
}

export async function getProblemImpact(problemId: number): Promise<ProblemImpactRaw> {
  const { rows } = await pool.query<{
    incident_count: string;
    high_critical_count: string;
    affected_project_ids: string[] | null;
    total_duration_seconds: string | null;
    avg_mttr_seconds: string | null;
    first_incident_at: string | Date | null;
    last_incident_at: string | Date | null;
  }>(
    `WITH linked_incidents AS (
       SELECT i.id, i.project_id, i.severity, i.resolved, i.created_at, i.resolved_at
       FROM problem_incidents pi
       JOIN incidents i ON i.id = pi.incident_id
       WHERE pi.problem_id = $1
     )
     SELECT
       COUNT(*) AS incident_count,
       COUNT(*) FILTER (WHERE severity IN ('HIGH', 'CRITICAL')) AS high_critical_count,
       ARRAY_AGG(DISTINCT project_id) AS affected_project_ids,
       SUM(EXTRACT(EPOCH FROM (resolved_at - created_at))) FILTER (WHERE resolved) AS total_duration_seconds,
       AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))) FILTER (WHERE resolved) AS avg_mttr_seconds,
       MIN(created_at) AS first_incident_at,
       MAX(created_at) AS last_incident_at
     FROM linked_incidents`,
    [problemId],
  );
  const row = rows[0];
  return {
    incidentCount: Number(row?.incident_count ?? 0),
    highCriticalIncidentCount: Number(row?.high_critical_count ?? 0),
    affectedProjectIds: row?.affected_project_ids ?? [],
    totalIncidentDurationSeconds: row?.total_duration_seconds !== null && row?.total_duration_seconds !== undefined ? Number(row.total_duration_seconds) : null,
    avgMttrSeconds: row?.avg_mttr_seconds !== null && row?.avg_mttr_seconds !== undefined ? Number(row.avg_mttr_seconds) : null,
    firstIncidentAt: row?.first_incident_at ? toIso(row.first_incident_at) : null,
    lastIncidentAt: row?.last_incident_at ? toIso(row.last_incident_at) : null,
  };
}

// Batch-Variante fuer die Problem-Liste (Auftragspunkt 27 "kein N+1" - eine
// Abfrage fuer ALLE gelisteten Probleme statt getProblemImpact() pro Zeile).
export interface ProblemImpactSummary {
  incidentCount: number;
  criticalIncidentCount: number;
  lastIncidentAt: string | null;
}

export async function getProblemImpactSummaries(problemIds: number[]): Promise<Map<number, ProblemImpactSummary>> {
  if (problemIds.length === 0) return new Map();
  const { rows } = await pool.query<{ problem_id: number; incident_count: string; critical_count: string; last_incident_at: string | Date | null }>(
    `SELECT pi.problem_id,
            COUNT(DISTINCT i.id) AS incident_count,
            COUNT(DISTINCT i.id) FILTER (WHERE i.severity IN ('HIGH', 'CRITICAL')) AS critical_count,
            MAX(i.created_at) AS last_incident_at
     FROM problem_incidents pi
     JOIN incidents i ON i.id = pi.incident_id
     WHERE pi.problem_id = ANY($1::bigint[])
     GROUP BY pi.problem_id`,
    [problemIds],
  );
  return new Map(
    rows.map((row) => [
      Number(row.problem_id),
      { incidentCount: Number(row.incident_count), criticalIncidentCount: Number(row.critical_count), lastIncidentAt: row.last_incident_at ? toIso(row.last_incident_at) : null },
    ]),
  );
}

// Batch: fuer welche Projekte ist ein Problem (ueber seine verknuepften
// Incidents) relevant - Grundlage fuer die SLO-Integration (core/problem-
// management.ts), sowohl fuer die Liste als auch fuer ein einzelnes
// Problem, immer als EINE Abfrage.
export async function getAffectedProjectIdsForProblems(problemIds: number[]): Promise<Map<number, string[]>> {
  if (problemIds.length === 0) return new Map();
  const { rows } = await pool.query<{ problem_id: number; project_id: string }>(
    `SELECT DISTINCT pi.problem_id, i.project_id
     FROM problem_incidents pi
     JOIN incidents i ON i.id = pi.incident_id
     WHERE pi.problem_id = ANY($1::bigint[])`,
    [problemIds],
  );
  const map = new Map<number, string[]>();
  for (const row of rows) {
    const problemId = Number(row.problem_id);
    const existing = map.get(problemId) ?? [];
    existing.push(row.project_id);
    map.set(problemId, existing);
  }
  return map;
}
