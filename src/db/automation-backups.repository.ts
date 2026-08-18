import { pool } from "./pool";
import type { AutomationBackup } from "../types/automation.types";

interface AutomationBackupRow {
  id: number;
  project_id: string;
  automation_execution_id: number | null;
  data: Record<string, unknown>;
  created_at: string | Date;
}

function mapRow(row: AutomationBackupRow): AutomationBackup {
  return {
    id: row.id,
    projectId: row.project_id,
    automationExecutionId: row.automation_execution_id,
    data: row.data,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

export interface CreateAutomationBackupInput {
  projectId: string;
  automationExecutionId?: number;
  data: Record<string, unknown>;
}

export async function createAutomationBackup(input: CreateAutomationBackupInput): Promise<AutomationBackup> {
  const { rows } = await pool.query<AutomationBackupRow>(
    `INSERT INTO automation_backups (project_id, automation_execution_id, data)
     VALUES ($1, $2, $3) RETURNING id, project_id, automation_execution_id, data, created_at`,
    [input.projectId, input.automationExecutionId ?? null, JSON.stringify(input.data)],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Backup konnte nicht gespeichert werden");
  }
  return mapRow(row);
}

export async function listAutomationBackups(projectId?: string, limit = 50): Promise<AutomationBackup[]> {
  const values: unknown[] = [];
  const where = projectId ? (values.push(projectId), `WHERE project_id = $1`) : "";
  values.push(limit);
  const { rows } = await pool.query<AutomationBackupRow>(
    `SELECT id, project_id, automation_execution_id, data, created_at
     FROM automation_backups ${where} ORDER BY created_at DESC LIMIT $${values.length}`,
    values,
  );
  return rows.map(mapRow);
}
