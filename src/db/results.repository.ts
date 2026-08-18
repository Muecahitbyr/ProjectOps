import { pool } from "./pool";
import type { CheckResult, CheckStatus } from "../types/check-result.types";
import type { CheckType } from "../types/project.types";

interface CheckResultRow {
  project_id: string;
  check_id: string;
  check_type: string;
  status: string;
  status_code: number | null;
  response_time_ms: number | null;
  error: string | null;
  metadata: Record<string, unknown> | null;
  checked_at: string | Date;
}

const RESULT_COLUMNS = `
  project_id, check_id, check_type, status, status_code, response_time_ms, error, metadata, checked_at
`;

function mapRow(row: CheckResultRow): CheckResult {
  return {
    projectId: row.project_id,
    checkId: row.check_id,
    type: row.check_type as CheckType,
    status: row.status as CheckStatus,
    checkedAt: row.checked_at instanceof Date ? row.checked_at.toISOString() : row.checked_at,
    ...(row.status_code !== null ? { statusCode: row.status_code } : {}),
    ...(row.response_time_ms !== null ? { responseTimeMs: row.response_time_ms } : {}),
    ...(row.error !== null ? { error: row.error } : {}),
    ...(row.metadata !== null ? { metadata: row.metadata } : {}),
  };
}

// Phase 13 Teil 1 "Monitoring Agents": agentId ist ein zusaetzlicher,
// optionaler Parameter statt eines neuen Felds auf CheckResult selbst -
// CheckResult wird an vielen Stellen (Realtime-Events, Frontend-Typen)
// verwendet, eine Erweiterung dort haette unnoetig weit gestreut. undefined
// bleibt gueltig (aeltere/agentenlose Aufrufer brauchen keine Anpassung).
export async function insertResult(result: CheckResult, agentId?: string): Promise<void> {
  await pool.query(
    `INSERT INTO check_results (project_id, check_id, check_type, status, status_code, response_time_ms, error, metadata, checked_at, agent_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      result.projectId,
      result.checkId,
      result.type,
      result.status,
      result.statusCode ?? null,
      result.responseTimeMs ?? null,
      result.error ?? null,
      result.metadata ? JSON.stringify(result.metadata) : null,
      result.checkedAt,
      agentId ?? null,
    ],
  );
}

export async function getLatestForCheck(checkId: string): Promise<CheckResult | undefined> {
  const { rows } = await pool.query<CheckResultRow>(
    `SELECT ${RESULT_COLUMNS}
     FROM check_results
     WHERE check_id = $1
     ORDER BY checked_at DESC
     LIMIT 1`,
    [checkId],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function getLatestResults(): Promise<CheckResult[]> {
  const { rows } = await pool.query<CheckResultRow>(
    `SELECT DISTINCT ON (check_id) ${RESULT_COLUMNS}
     FROM check_results
     ORDER BY check_id, checked_at DESC`,
  );
  return rows.map(mapRow);
}

export async function getHistory(checkId: string, limit = 50): Promise<CheckResult[]> {
  const { rows } = await pool.query<CheckResultRow>(
    `SELECT ${RESULT_COLUMNS}
     FROM check_results
     WHERE check_id = $1
     ORDER BY checked_at DESC
     LIMIT $2`,
    [checkId, limit],
  );
  return rows.map(mapRow);
}

export interface CheckStats {
  checkId: string;
  periodDays: number;
  uptimePercent: number;
  totalChecks: number;
  errorCount: number;
  avgResponseTimeMs: number | null;
  lastOutages: CheckResult[];
}

export async function getStats(checkId: string, periodDays = 7): Promise<CheckStats> {
  const { rows } = await pool.query<{
    total: string;
    online_count: string;
    error_count: string;
    avg_response_time_ms: string | null;
  }>(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE status IN ('ONLINE', 'WARNING')) AS online_count,
       COUNT(*) FILTER (WHERE status IN ('OFFLINE', 'ERROR')) AS error_count,
       AVG(response_time_ms) FILTER (WHERE status IN ('ONLINE', 'WARNING')) AS avg_response_time_ms
     FROM check_results
     WHERE check_id = $1 AND checked_at >= now() - ($2 || ' days')::interval`,
    [checkId, periodDays],
  );

  const summary = rows[0];
  const total = Number(summary?.total ?? 0);
  const onlineCount = Number(summary?.online_count ?? 0);
  const avgResponseTimeMs = summary?.avg_response_time_ms;

  const { rows: outageRows } = await pool.query<CheckResultRow>(
    `SELECT ${RESULT_COLUMNS}
     FROM check_results
     WHERE check_id = $1 AND status IN ('OFFLINE', 'ERROR')
     ORDER BY checked_at DESC
     LIMIT 10`,
    [checkId],
  );

  return {
    checkId,
    periodDays,
    uptimePercent: total > 0 ? Number(((onlineCount / total) * 100).toFixed(2)) : 100,
    totalChecks: total,
    errorCount: Number(summary?.error_count ?? 0),
    avgResponseTimeMs: avgResponseTimeMs ? Math.round(Number(avgResponseTimeMs)) : null,
    lastOutages: outageRows.map(mapRow),
  };
}
