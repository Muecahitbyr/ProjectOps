import { pool } from "./pool";
import type { AutomationLog, AutomationLogLevel } from "../types/automation.types";

interface AutomationLogRow {
  id: number;
  execution_id: number;
  timestamp: string | Date;
  level: AutomationLogLevel;
  message: string;
  source: string;
}

function mapRow(row: AutomationLogRow): AutomationLog {
  return {
    id: row.id,
    executionId: row.execution_id,
    timestamp: row.timestamp instanceof Date ? row.timestamp.toISOString() : row.timestamp,
    level: row.level,
    message: row.message,
    source: row.source,
  };
}

export interface AppendAutomationLogInput {
  executionId: number;
  level: AutomationLogLevel;
  message: string;
  source: string;
}

// Teil 6 "Execution Logs" - jede Zeile wird sofort persistiert UND per
// Realtime-Event gestreamt (siehe automation/execution-logger.ts), damit
// das Frontend live mitliest statt zu pollen.
export async function appendAutomationLog(input: AppendAutomationLogInput): Promise<AutomationLog> {
  const { rows } = await pool.query<AutomationLogRow>(
    `INSERT INTO automation_logs (execution_id, level, message, source)
     VALUES ($1, $2, $3, $4) RETURNING id, execution_id, "timestamp", level, message, source`,
    [input.executionId, input.level, input.message, input.source],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Log-Eintrag konnte nicht gespeichert werden");
  }
  return mapRow(row);
}

// Phase 17 Auftragspunkt 8 "Automation Read API" - limit/offset additiv
// fuer GET /api/v1/automation/executions/:id/logs.
export async function listAutomationLogsForExecution(
  executionId: number,
  level?: AutomationLogLevel,
  limit?: number,
  offset?: number,
): Promise<AutomationLog[]> {
  const values: unknown[] = [executionId];
  const levelFilter = level ? (values.push(level), `AND level = $${values.length}`) : "";
  values.push(limit ?? 1000);
  const limitIndex = values.length;
  values.push(offset ?? 0);
  const offsetIndex = values.length;
  const { rows } = await pool.query<AutomationLogRow>(
    `SELECT id, execution_id, "timestamp", level, message, source
     FROM automation_logs WHERE execution_id = $1 ${levelFilter} ORDER BY "timestamp" ASC LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    values,
  );
  return rows.map(mapRow);
}

export async function countAutomationLogsForExecution(executionId: number, level?: AutomationLogLevel): Promise<number> {
  const values: unknown[] = [executionId];
  const levelFilter = level ? (values.push(level), `AND level = $${values.length}`) : "";
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM automation_logs WHERE execution_id = $1 ${levelFilter}`,
    values,
  );
  return Number(rows[0]?.count ?? 0);
}
