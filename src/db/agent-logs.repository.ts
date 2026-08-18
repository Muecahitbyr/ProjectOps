import { pool } from "./pool";
import type { AgentLogEntry, CreateAgentLogInput } from "../types/agent-log.types";

interface AgentLogRow {
  id: number;
  agent_id: string;
  project_id: string | null;
  check_id: string | null;
  level: AgentLogEntry["level"];
  category: string;
  message: string;
  created_at: string | Date;
}

function mapRow(row: AgentLogRow): AgentLogEntry {
  return {
    id: row.id,
    agentId: row.agent_id,
    projectId: row.project_id,
    checkId: row.check_id,
    level: row.level,
    category: row.category,
    message: row.message,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

const COLUMNS = `id, agent_id, project_id, check_id, level, category, message, created_at`;

export async function createAgentLogEntry(input: CreateAgentLogInput): Promise<AgentLogEntry> {
  const { rows } = await pool.query<AgentLogRow>(
    `INSERT INTO agent_logs (agent_id, project_id, check_id, level, category, message)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${COLUMNS}`,
    [input.agentId, input.projectId ?? null, input.checkId ?? null, input.level, input.category, input.message],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Agent-Log konnte nicht gespeichert werden");
  }
  return mapRow(row);
}

export interface ListAgentLogsFilters {
  agentId?: string;
  projectId?: string;
  checkId?: string;
  level?: AgentLogEntry["level"];
  limit: number;
}

export async function listAgentLogs(filters: ListAgentLogsFilters): Promise<AgentLogEntry[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  const add = (sql: string, value: unknown): void => {
    values.push(value);
    conditions.push(sql.replace("$$", `$${values.length}`));
  };

  if (filters.agentId) add("agent_id = $$", filters.agentId);
  if (filters.projectId) add("project_id = $$", filters.projectId);
  if (filters.checkId) add("check_id = $$", filters.checkId);
  if (filters.level) add("level = $$", filters.level);

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  values.push(filters.limit);

  const { rows } = await pool.query<AgentLogRow>(
    `SELECT ${COLUMNS} FROM agent_logs ${where} ORDER BY created_at DESC LIMIT $${values.length}`,
    values,
  );
  return rows.map(mapRow);
}
