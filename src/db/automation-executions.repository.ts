import { pool } from "./pool";
import type { AutomationExecution, AutomationExecutionStatus } from "../types/automation.types";

interface AutomationExecutionRow {
  id: number;
  automation_action_id: number;
  status: AutomationExecutionStatus;
  result: Record<string, unknown> | null;
  error: string | null;
  dry_run: boolean;
  approved_by: string | null;
  executed_by: string | null;
  stdout: string | null;
  stderr: string | null;
  exit_code: number | null;
  duration_ms: number | null;
  started_at: string | Date | null;
  finished_at: string | Date | null;
  created_at: string | Date;
}

const COLUMNS = `id, automation_action_id, status, result, error, dry_run, approved_by, executed_by,
  stdout, stderr, exit_code, duration_ms, started_at, finished_at, created_at`;
const COLUMNS_AE = `ae.id, ae.automation_action_id, ae.status, ae.result, ae.error, ae.dry_run, ae.approved_by, ae.executed_by,
  ae.stdout, ae.stderr, ae.exit_code, ae.duration_ms, ae.started_at, ae.finished_at, ae.created_at`;

function toIsoOrNull(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function mapRow(row: AutomationExecutionRow): AutomationExecution {
  return {
    id: row.id,
    automationActionId: row.automation_action_id,
    status: row.status,
    result: row.result,
    error: row.error,
    dryRun: row.dry_run,
    approvedBy: row.approved_by,
    executedBy: row.executed_by,
    stdout: row.stdout,
    stderr: row.stderr,
    exitCode: row.exit_code,
    durationMs: row.duration_ms,
    startedAt: toIsoOrNull(row.started_at),
    finishedAt: toIsoOrNull(row.finished_at),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

export interface CreateAutomationExecutionInput {
  automationActionId: number;
  dryRun?: boolean;
  approvedBy?: string;
}

// Phase 30 Auftragspunkt 5 "Idempotenz/Race Safety" - Rueckgabetyp erweitert
// um das "CONFLICT"-Sentinel, exakt dasselbe, bereits etablierte Muster wie
// db/service-dependencies.repository.ts#createDependencyIfUnderQuota (Fehler-
// code 23505 aus der partiellen Unique-Constraint
// idx_automation_executions_one_active_per_action, Migration 0053, abfangen
// statt als rohen 500 durchzureichen).
export async function createAutomationExecution(input: CreateAutomationExecutionInput): Promise<AutomationExecution | "ALREADY_RUNNING"> {
  try {
    const { rows } = await pool.query<AutomationExecutionRow>(
      `INSERT INTO automation_executions (automation_action_id, status, dry_run, approved_by)
       VALUES ($1, 'CREATED', $2, $3) RETURNING ${COLUMNS}`,
      [input.automationActionId, input.dryRun ?? false, input.approvedBy ?? null],
    );
    const row = rows[0];
    if (!row) {
      throw new Error("Automatisierungs-Ausfuehrung konnte nicht angelegt werden");
    }
    return mapRow(row);
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "23505") {
      return "ALREADY_RUNNING";
    }
    throw err;
  }
}

export async function listExecutionsForAction(automationActionId: number): Promise<AutomationExecution[]> {
  const { rows } = await pool.query<AutomationExecutionRow>(
    `SELECT ${COLUMNS} FROM automation_executions WHERE automation_action_id = $1 ORDER BY created_at DESC`,
    [automationActionId],
  );
  return rows.map(mapRow);
}

// Phase 30 "Enterprise Reliability, Automated Recovery & Operational
// Resilience" - core/recovery-safety.ts braucht fuer den Safety-Gate NUR die
// juengste Ausfuehrung (Cooldown/laufend?/letztes Ergebnis) und die
// Gesamtzahl (max_attempts_per_incident) je Aktion, nicht die volle Liste -
// zwei kleine, gezielte Abfragen statt listExecutionsForAction() plus
// Nachverarbeitung im Anwendungscode.
export async function getLatestExecutionForAction(automationActionId: number): Promise<AutomationExecution | undefined> {
  const { rows } = await pool.query<AutomationExecutionRow>(
    `SELECT ${COLUMNS} FROM automation_executions WHERE automation_action_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [automationActionId],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

// Phase 31 "Enterprise Change/Incident Communication & Stakeholder
// Notification Intelligence" Auftragspunkt 12 "Integration mit Recovery" -
// die juengste Ausfuehrung (egal welcher Regel) fuer diesen Incident, um zu
// erkennen "wurde gerade eben eine Recovery Action erfolgreich/erfolglos
// abgeschlossen" (core/incident-communication.ts). Ein Join ueber
// automation_actions.incident_id, kein neuer Signalweg.
export async function getLatestExecutionForIncident(incidentId: number): Promise<AutomationExecution | undefined> {
  const { rows } = await pool.query<AutomationExecutionRow>(
    `SELECT ${COLUMNS_AE} FROM automation_executions ae
     JOIN automation_actions aa ON aa.id = ae.automation_action_id
     WHERE aa.incident_id = $1 AND ae.status IN ('SUCCESS', 'FAILED')
     ORDER BY ae.finished_at DESC NULLS LAST LIMIT 1`,
    [incidentId],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function countExecutionsForAction(automationActionId: number): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM automation_executions WHERE automation_action_id = $1`,
    [automationActionId],
  );
  return Number(rows[0]?.count ?? 0);
}

export interface ListAutomationExecutionsFilters {
  projectId?: string;
  projectIds?: string[];
  status?: AutomationExecutionStatus;
  limit?: number;
  offset?: number;
}

// Fuer die Executions-/History-Tabs im Automation Center (Teil 3) - joint
// gegen automation_actions fuer den Projekt-Filter, ohne die Zeile selbst
// aufzublaehen. Phase 17 Auftragspunkt 8 "Automation Read API" -
// projectIds/offset additiv fuer GET /api/v1/automation/executions.
export async function listAutomationExecutions(filters: ListAutomationExecutionsFilters = {}): Promise<AutomationExecution[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (filters.projectId) {
    values.push(filters.projectId);
    conditions.push(`aa.project_id = $${values.length}`);
  }
  if (filters.projectIds !== undefined) {
    values.push(filters.projectIds);
    conditions.push(`aa.project_id = ANY($${values.length})`);
  }
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`ae.status = $${values.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  values.push(filters.limit ?? 100);
  const limitIndex = values.length;
  values.push(filters.offset ?? 0);
  const offsetIndex = values.length;

  const { rows } = await pool.query<AutomationExecutionRow>(
    `SELECT ${COLUMNS_AE}
     FROM automation_executions ae
     JOIN automation_actions aa ON aa.id = ae.automation_action_id
     ${where}
     ORDER BY ae.created_at DESC LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    values,
  );
  return rows.map(mapRow);
}

export async function countAutomationExecutions(filters: { projectIds?: string[]; status?: AutomationExecutionStatus } = {}): Promise<number> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (filters.projectIds !== undefined) {
    values.push(filters.projectIds);
    conditions.push(`aa.project_id = ANY($${values.length})`);
  }
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`ae.status = $${values.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM automation_executions ae JOIN automation_actions aa ON aa.id = ae.automation_action_id ${where}`,
    values,
  );
  return Number(rows[0]?.count ?? 0);
}

export async function getAutomationExecutionById(id: number): Promise<AutomationExecution | undefined> {
  const { rows } = await pool.query<AutomationExecutionRow>(
    `SELECT ${COLUMNS} FROM automation_executions WHERE id = $1`,
    [id],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function markExecutionRunning(id: number, executedBy?: string): Promise<AutomationExecution | undefined> {
  const { rows } = await pool.query<AutomationExecutionRow>(
    `UPDATE automation_executions SET status = 'RUNNING', started_at = now(), executed_by = $2 WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, executedBy ?? null],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export interface FinishExecutionOutcome {
  result?: Record<string, unknown>;
  error?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
}

export async function markExecutionFinished(
  id: number,
  status: "SUCCESS" | "FAILED",
  outcome: FinishExecutionOutcome,
): Promise<AutomationExecution | undefined> {
  const { rows } = await pool.query<AutomationExecutionRow>(
    `UPDATE automation_executions
     SET status = $2, result = $3, error = $4, stdout = $5, stderr = $6, exit_code = $7,
         finished_at = now(),
         duration_ms = EXTRACT(EPOCH FROM (now() - started_at)) * 1000
     WHERE id = $1 RETURNING ${COLUMNS}`,
    [
      id,
      status,
      outcome.result ? JSON.stringify(outcome.result) : null,
      outcome.error ?? null,
      outcome.stdout ?? null,
      outcome.stderr ?? null,
      outcome.exitCode ?? null,
    ],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

// ---------------------------------------------------------------------------
// Analytics (Teil 7)
// ---------------------------------------------------------------------------
export interface AutomationSuccessRate {
  total: number;
  success: number;
  failed: number;
  successRate: number;
}

export async function getAutomationSuccessRate(projectId?: string): Promise<AutomationSuccessRate> {
  const values: unknown[] = [];
  const where = projectId ? (values.push(projectId), `WHERE aa.project_id = $1 AND ae.status IN ('SUCCESS', 'FAILED')`) : `WHERE ae.status IN ('SUCCESS', 'FAILED')`;
  const { rows } = await pool.query<{ total: string; success: string }>(
    `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE ae.status = 'SUCCESS') AS success
     FROM automation_executions ae JOIN automation_actions aa ON aa.id = ae.automation_action_id ${where}`,
    values,
  );
  const total = Number(rows[0]?.total ?? 0);
  const success = Number(rows[0]?.success ?? 0);
  return { total, success, failed: total - success, successRate: total > 0 ? success / total : 0 };
}

export async function getAverageExecutionDurationMs(projectId?: string): Promise<number | null> {
  const values: unknown[] = [];
  const where = projectId
    ? (values.push(projectId), `WHERE aa.project_id = $1 AND ae.duration_ms IS NOT NULL`)
    : `WHERE ae.duration_ms IS NOT NULL`;
  const { rows } = await pool.query<{ avg: string | null }>(
    `SELECT AVG(ae.duration_ms) AS avg FROM automation_executions ae JOIN automation_actions aa ON aa.id = ae.automation_action_id ${where}`,
    values,
  );
  const avg = rows[0]?.avg;
  return avg === null || avg === undefined ? null : Number(avg);
}

// Freigabezeit = Zeit zwischen Vorschlagserstellung (automation_actions.created_at)
// und dem Start der Ausfuehrung (automation_executions.started_at) - nur fuer
// Aktionen, die tatsaechlich eine manuelle Freigabe durchlaufen haben
// (approved_by gesetzt).
export async function getAverageApprovalTimeMs(projectId?: string): Promise<number | null> {
  const values: unknown[] = [];
  const projectFilter = projectId ? (values.push(projectId), `AND aa.project_id = $1`) : "";
  const { rows } = await pool.query<{ avg: string | null }>(
    `SELECT AVG(EXTRACT(EPOCH FROM (ae.started_at - aa.created_at)) * 1000) AS avg
     FROM automation_executions ae JOIN automation_actions aa ON aa.id = ae.automation_action_id
     WHERE ae.approved_by IS NOT NULL AND ae.started_at IS NOT NULL ${projectFilter}`,
    values,
  );
  const avg = rows[0]?.avg;
  return avg === null || avg === undefined ? null : Number(avg);
}

export interface TriggerCount {
  trigger: string;
  count: number;
}

export async function getTopTriggers(limit = 5): Promise<TriggerCount[]> {
  const { rows } = await pool.query<{ trigger: string; count: string }>(
    `SELECT trigger, COUNT(*) AS count FROM automation_actions GROUP BY trigger ORDER BY count DESC LIMIT $1`,
    [limit],
  );
  return rows.map((row) => ({ trigger: row.trigger, count: Number(row.count) }));
}

export interface ActionFailureCount {
  action: string;
  failedCount: number;
}

export async function getTopFailedActions(limit = 5): Promise<ActionFailureCount[]> {
  const { rows } = await pool.query<{ action: string; failed_count: string }>(
    `SELECT aa.action, COUNT(*) AS failed_count
     FROM automation_executions ae JOIN automation_actions aa ON aa.id = ae.automation_action_id
     WHERE ae.status = 'FAILED'
     GROUP BY aa.action ORDER BY failed_count DESC LIMIT $1`,
    [limit],
  );
  return rows.map((row) => ({ action: row.action, failedCount: Number(row.failed_count) }));
}

export interface ProjectAutomationCount {
  projectId: string;
  executionCount: number;
}

export async function getMostAutomatedProjects(limit = 5): Promise<ProjectAutomationCount[]> {
  const { rows } = await pool.query<{ project_id: string; execution_count: string }>(
    `SELECT aa.project_id, COUNT(*) AS execution_count
     FROM automation_executions ae JOIN automation_actions aa ON aa.id = ae.automation_action_id
     GROUP BY aa.project_id ORDER BY execution_count DESC LIMIT $1`,
    [limit],
  );
  return rows.map((row) => ({ projectId: row.project_id, executionCount: Number(row.execution_count) }));
}

export interface AutomationTrendPoint {
  day: string;
  total: number;
  success: number;
  failed: number;
}

// Taegliche Ausfuehrungszahlen der letzten `days` Tage (Teil 7 "Automation Trend").
export async function getAutomationTrend(days = 14): Promise<AutomationTrendPoint[]> {
  const { rows } = await pool.query<{ day: string; total: string; success: string; failed: string }>(
    `SELECT date_trunc('day', created_at)::date AS day,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE status = 'SUCCESS') AS success,
            COUNT(*) FILTER (WHERE status = 'FAILED') AS failed
     FROM automation_executions
     WHERE created_at >= now() - ($1 || ' days')::interval
     GROUP BY day ORDER BY day`,
    [days],
  );
  return rows.map((row) => ({
    day: row.day,
    total: Number(row.total),
    success: Number(row.success),
    failed: Number(row.failed),
  }));
}

export interface ExecutionHeatmapCell {
  weekday: number;
  hour: number;
  count: number;
}

// Stunde x Wochentag - Teil 7 "Execution Heatmap".
export async function getExecutionHeatmap(days = 30): Promise<ExecutionHeatmapCell[]> {
  const { rows } = await pool.query<{ weekday: string; hour: string; count: string }>(
    `SELECT EXTRACT(ISODOW FROM created_at) AS weekday, EXTRACT(HOUR FROM created_at) AS hour, COUNT(*) AS count
     FROM automation_executions
     WHERE created_at >= now() - ($1 || ' days')::interval
     GROUP BY weekday, hour`,
    [days],
  );
  return rows.map((row) => ({ weekday: Number(row.weekday), hour: Number(row.hour), count: Number(row.count) }));
}
