import { pool } from "./pool";
import type { Slo, SliType, SloEvaluation, SloStatus } from "../types/slo.types";

interface SloRow {
  id: number;
  organization_id: string;
  team_id: string | null;
  project_id: string | null;
  check_id: string | null;
  name: string;
  description: string | null;
  sli_type: string;
  target: string;
  latency_threshold_ms: number | null;
  window_days: number;
  enabled: boolean;
  created_by: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

const SLO_COLUMNS = `
  id, organization_id, team_id, project_id, check_id, name, description, sli_type,
  target, latency_threshold_ms, window_days, enabled, created_by, created_at, updated_at
`;

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function mapRow(row: SloRow): Slo {
  return {
    // BIGSERIAL - der pg-Treiber liefert diese Spalte als String (wie ueberall
    // sonst im Code, z.B. incidents.repository.ts), obwohl SloRow.id als
    // number deklariert ist. Beim Live-Testen (Phase 34) tatsaechlich
    // gefunden: POST /platform/slo lieferte {"id":"28"} statt {"id":28}.
    id: Number(row.id),
    organizationId: row.organization_id,
    teamId: row.team_id,
    projectId: row.project_id,
    checkId: row.check_id,
    name: row.name,
    description: row.description,
    sliType: row.sli_type as SliType,
    target: Number(row.target),
    latencyThresholdMs: row.latency_threshold_ms,
    windowDays: row.window_days,
    enabled: row.enabled,
    createdBy: row.created_by,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export interface CreateSloInput {
  organizationId: string;
  teamId?: string | null;
  projectId?: string | null;
  checkId?: string | null;
  name: string;
  description?: string | null;
  sliType: SliType;
  target: number;
  latencyThresholdMs?: number | null;
  windowDays?: number;
  enabled?: boolean;
  createdBy?: string | null;
}

export interface UpdateSloInput {
  name?: string;
  description?: string | null;
  target?: number;
  latencyThresholdMs?: number | null;
  windowDays?: number;
  teamId?: string | null;
  enabled?: boolean;
}

export interface ListSlosFilter {
  organizationId?: string;
  teamId?: string;
  projectId?: string;
  // Phase 25 "Enterprise Service Dependency Intelligence & Impact Analysis" -
  // fuer die Blast-Radius-Berechnung (core/topology.ts) muessen SLOs fuer
  // BIS ZU MAX_TOPOLOGY_NODES betroffene Projekte auf einmal geladen werden
  // koennen - analog zu getIncidents()/listAlertRules() (projectIds via
  // ANY($n)), statt einer SLO-Abfrage pro betroffenem Service (N+1).
  projectIds?: string[];
  enabled?: boolean;
}

export async function listSlos(filter: ListSlosFilter = {}): Promise<Slo[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (filter.organizationId) {
    values.push(filter.organizationId);
    conditions.push(`organization_id = $${values.length}`);
  }
  if (filter.teamId) {
    values.push(filter.teamId);
    conditions.push(`team_id = $${values.length}`);
  }
  if (filter.projectId) {
    values.push(filter.projectId);
    conditions.push(`project_id = $${values.length}`);
  }
  if (filter.projectIds !== undefined) {
    values.push(filter.projectIds);
    conditions.push(`project_id = ANY($${values.length})`);
  }
  if (filter.enabled !== undefined) {
    values.push(filter.enabled);
    conditions.push(`enabled = $${values.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await pool.query<SloRow>(
    `SELECT ${SLO_COLUMNS} FROM slos ${where} ORDER BY created_at DESC`,
    values,
  );
  return rows.map(mapRow);
}

export async function getSloById(id: number): Promise<Slo | undefined> {
  const { rows } = await pool.query<SloRow>(`SELECT ${SLO_COLUMNS} FROM slos WHERE id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function getSloOrganizationId(id: number): Promise<string | undefined> {
  const { rows } = await pool.query<{ organization_id: string }>(`SELECT organization_id FROM slos WHERE id = $1`, [id]);
  return rows[0]?.organization_id;
}

export async function countSlosForOrganization(organizationId: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM slos WHERE organization_id = $1`,
    [organizationId],
  );
  return Number(rows[0]?.count ?? 0);
}

// Auftragspunkt 19 "Plan Quotas" - dieselbe race-sichere SELECT...FOR
// UPDATE-Transaktion wie createAlertRuleIfUnderQuota()/createApiKeyIfUnderQuota()
// (Phase 20/21): COUNT + INSERT ohne Sperre waere unter gleichzeitigen
// Anfragen nicht quota-sicher (Auftrag verbietet das explizit).
export async function createSloIfUnderQuota(input: CreateSloInput, maxSlo: number): Promise<Slo | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT id FROM organizations WHERE id = $1 FOR UPDATE`, [input.organizationId]);
    const { rows: countRows } = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM slos WHERE organization_id = $1`,
      [input.organizationId],
    );
    if (Number(countRows[0]?.count ?? 0) >= maxSlo) {
      await client.query("ROLLBACK");
      return null;
    }

    const { rows } = await client.query<SloRow>(
      `INSERT INTO slos
         (organization_id, team_id, project_id, check_id, name, description, sli_type, target, latency_threshold_ms, window_days, enabled, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING ${SLO_COLUMNS}`,
      [
        input.organizationId,
        input.teamId ?? null,
        input.projectId ?? null,
        input.checkId ?? null,
        input.name,
        input.description ?? null,
        input.sliType,
        input.target,
        input.latencyThresholdMs ?? null,
        input.windowDays ?? 30,
        input.enabled ?? true,
        input.createdBy ?? null,
      ],
    );
    await client.query("COMMIT");
    const row = rows[0];
    if (!row) {
      throw new Error("SLO konnte nicht angelegt werden");
    }
    return mapRow(row);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function updateSlo(id: number, input: UpdateSloInput): Promise<Slo | undefined> {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (input.name !== undefined) {
    values.push(input.name);
    sets.push(`name = $${values.length}`);
  }
  if (input.description !== undefined) {
    values.push(input.description);
    sets.push(`description = $${values.length}`);
  }
  if (input.target !== undefined) {
    values.push(input.target);
    sets.push(`target = $${values.length}`);
  }
  if (input.latencyThresholdMs !== undefined) {
    values.push(input.latencyThresholdMs);
    sets.push(`latency_threshold_ms = $${values.length}`);
  }
  if (input.windowDays !== undefined) {
    values.push(input.windowDays);
    sets.push(`window_days = $${values.length}`);
  }
  if (input.teamId !== undefined) {
    values.push(input.teamId);
    sets.push(`team_id = $${values.length}`);
  }
  if (input.enabled !== undefined) {
    values.push(input.enabled);
    sets.push(`enabled = $${values.length}`);
  }
  if (sets.length === 0) {
    return getSloById(id);
  }
  sets.push(`updated_at = now()`);
  values.push(id);
  const { rows } = await pool.query<SloRow>(
    `UPDATE slos SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING ${SLO_COLUMNS}`,
    values,
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function deleteSlo(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM slos WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

interface SloEvaluationRow {
  id: number;
  slo_id: number;
  sli_value: string;
  target: string;
  error_budget_remaining_percent: string;
  burn_rate: string;
  status: string;
  evaluated_at: string | Date;
}

const SLO_EVALUATION_COLUMNS = `id, slo_id, sli_value, target, error_budget_remaining_percent, burn_rate, status, evaluated_at`;

function mapEvaluationRow(row: SloEvaluationRow): SloEvaluation {
  return {
    // Dieselbe BIGSERIAL/BIGINT-String-Korrektur wie in mapRow() oben.
    id: Number(row.id),
    sloId: Number(row.slo_id),
    sliValue: Number(row.sli_value),
    target: Number(row.target),
    errorBudgetRemainingPercent: Number(row.error_budget_remaining_percent),
    burnRate: Number(row.burn_rate),
    status: row.status as SloStatus,
    evaluatedAt: toIso(row.evaluated_at),
  };
}

export interface RecordSloEvaluationInput {
  sloId: number;
  sliValue: number;
  target: number;
  errorBudgetRemainingPercent: number;
  burnRate: number;
  status: SloStatus;
}

// core/slo-evaluator.ts (Hintergrund-Auswertung, alle ~2 Minuten gedrosselt) -
// EIN Einfuegepunkt fuer historische Snapshots, analog zu
// db/incident-timeline.repository.ts#addTimelineEvent (Phase 21).
export async function recordSloEvaluation(input: RecordSloEvaluationInput): Promise<SloEvaluation> {
  const { rows } = await pool.query<SloEvaluationRow>(
    `INSERT INTO slo_evaluations (slo_id, sli_value, target, error_budget_remaining_percent, burn_rate, status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${SLO_EVALUATION_COLUMNS}`,
    [input.sloId, input.sliValue, input.target, input.errorBudgetRemainingPercent, input.burnRate, input.status],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("SLO-Auswertung konnte nicht gespeichert werden");
  }
  return mapEvaluationRow(row);
}

export async function getLatestSloEvaluation(sloId: number): Promise<SloEvaluation | undefined> {
  const { rows } = await pool.query<SloEvaluationRow>(
    `SELECT ${SLO_EVALUATION_COLUMNS} FROM slo_evaluations WHERE slo_id = $1 ORDER BY evaluated_at DESC LIMIT 1`,
    [sloId],
  );
  return rows[0] ? mapEvaluationRow(rows[0]) : undefined;
}

// Auftragspunkt 20 "Performance" - EINE Abfrage fuer den juengsten Snapshot
// je SLO (DISTINCT ON) statt einer Einzelabfrage pro SLO in einer Liste
// (N+1), verwendet von GET /platform/slo und GET /v1/slo (Listenansicht).
export async function getLatestSloEvaluationsForIds(sloIds: number[]): Promise<Map<number, SloEvaluation>> {
  if (sloIds.length === 0) return new Map();
  const { rows } = await pool.query<SloEvaluationRow>(
    `SELECT DISTINCT ON (slo_id) ${SLO_EVALUATION_COLUMNS}
     FROM slo_evaluations WHERE slo_id = ANY($1::bigint[])
     ORDER BY slo_id, evaluated_at DESC`,
    [sloIds],
  );
  // Map-Key MUSS Number(row.slo_id) sein (nicht der rohe String aus der
  // pg-Zeile) - Aufrufer schlagen mit einer echten Zahl nach (slo.id, siehe
  // mapRow() oben). Vor der id-Typ-Korrektur dort "funktionierte" ein
  // unkonvertierter String-Key nur zufaellig, weil beide Seiten damals
  // unkonvertierte Strings waren; das haette sich mit der mapRow()-Korrektur
  // sonst in einen echten Lookup-Bug verwandelt (jede current-Status-Anzeige
  // haette still auf "kein Snapshot vorhanden" zurueckgefallen).
  return new Map(rows.map((row) => [Number(row.slo_id), mapEvaluationRow(row)]));
}

export async function getSloHistory(sloId: number, from: Date, to: Date): Promise<SloEvaluation[]> {
  const { rows } = await pool.query<SloEvaluationRow>(
    `SELECT ${SLO_EVALUATION_COLUMNS} FROM slo_evaluations
     WHERE slo_id = $1 AND evaluated_at >= $2 AND evaluated_at < $3
     ORDER BY evaluated_at ASC`,
    [sloId, from.toISOString(), to.toISOString()],
  );
  return rows.map(mapEvaluationRow);
}

// Phase 35 "Enterprise Problem Management & Root-Cause Intelligence"
// Auftragspunkt 13 "SLO Integration" - Batch-Zaehlung von DEGRADED/CRITICAL-
// Snapshots je SLO innerhalb eines Zeitfensters (EIN Aufruf fuer ALLE
// betroffenen SLOs eines Problems statt getSloHistory() pro SLO - kein
// N+1). Bewusst als reine ZEITLICHE Korrelation gekennzeichnet, siehe
// core/problem-management.ts - slo_evaluations hat keine incident_id-Spalte,
// eine bewiesene Kausalitaet laesst sich daraus nicht ableiten.
export async function countSloBreachesInWindow(sloIds: number[], from: Date, to: Date): Promise<Map<number, number>> {
  if (sloIds.length === 0) return new Map();
  const { rows } = await pool.query<{ slo_id: number; count: string }>(
    `SELECT slo_id, COUNT(*) AS count FROM slo_evaluations
     WHERE slo_id = ANY($1::bigint[]) AND status IN ('DEGRADED', 'CRITICAL') AND evaluated_at >= $2 AND evaluated_at < $3
     GROUP BY slo_id`,
    [sloIds, from.toISOString(), to.toISOString()],
  );
  return new Map(rows.map((row) => [Number(row.slo_id), Number(row.count)]));
}
