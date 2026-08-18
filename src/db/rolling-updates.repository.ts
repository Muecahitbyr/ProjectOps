import { pool } from "./pool";
import { AppError } from "../core/app-error";
import { ROLLING_UPDATE_TRANSITIONS } from "../types/rolling-update.types";
import type { CreateRollingUpdateInput, RollingUpdate, RollingUpdateStatus } from "../types/rolling-update.types";

interface RollingUpdateRow {
  id: number;
  agent_id: string;
  target_version: string;
  status: RollingUpdateStatus;
  started_at: string | Date | null;
  finished_at: string | Date | null;
  error: string | null;
  created_by: string | null;
  created_at: string | Date;
}

function toIsoOrNull(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function mapRow(row: RollingUpdateRow): RollingUpdate {
  return {
    id: row.id,
    agentId: row.agent_id,
    targetVersion: row.target_version,
    status: row.status,
    startedAt: toIsoOrNull(row.started_at),
    finishedAt: toIsoOrNull(row.finished_at),
    error: row.error,
    createdBy: row.created_by,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

const COLUMNS = `id, agent_id, target_version, status, started_at, finished_at, error, created_by, created_at`;

export async function createRollingUpdate(input: CreateRollingUpdateInput): Promise<RollingUpdate> {
  const { rows } = await pool.query<RollingUpdateRow>(
    `INSERT INTO rolling_updates (agent_id, target_version, created_by) VALUES ($1, $2, $3) RETURNING ${COLUMNS}`,
    [input.agentId, input.targetVersion, input.createdBy ?? null],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Rolling Update konnte nicht angelegt werden");
  }
  return mapRow(row);
}

export async function listRollingUpdates(agentId: string | undefined, limit: number): Promise<RollingUpdate[]> {
  const values: unknown[] = [];
  const agentFilter = agentId ? (values.push(agentId), `WHERE agent_id = $${values.length}`) : "";
  values.push(limit);
  const { rows } = await pool.query<RollingUpdateRow>(
    `SELECT ${COLUMNS} FROM rolling_updates ${agentFilter} ORDER BY created_at DESC LIMIT $${values.length}`,
    values,
  );
  return rows.map(mapRow);
}

export async function getRollingUpdateById(id: number): Promise<RollingUpdate | undefined> {
  const { rows } = await pool.query<RollingUpdateRow>(`SELECT ${COLUMNS} FROM rolling_updates WHERE id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : undefined;
}

// Erzwingt die in rolling-update.types.ts definierte Statusmaschine
// (ROLLING_UPDATE_TRANSITIONS) - ein ungueltiger Sprung (z.B. PENDING ->
// HEALTHY) wird abgelehnt statt stillschweigend uebernommen.
export async function transitionRollingUpdate(id: number, nextStatus: RollingUpdateStatus, error?: string): Promise<RollingUpdate> {
  const current = await getRollingUpdateById(id);
  if (!current) {
    throw new AppError(404, "NOT_FOUND", "Rolling Update nicht gefunden");
  }
  const allowed = ROLLING_UPDATE_TRANSITIONS[current.status];
  if (!allowed.includes(nextStatus)) {
    throw new AppError(400, "VALIDATION_ERROR", `Uebergang ${current.status} -> ${nextStatus} ist nicht erlaubt`);
  }

  const isStart = current.status === "PENDING" && nextStatus === "DOWNLOADING";
  const isTerminal = nextStatus === "HEALTHY" || nextStatus === "FAILED" || nextStatus === "ROLLED_BACK";

  const { rows } = await pool.query<RollingUpdateRow>(
    `UPDATE rolling_updates
     SET status = $2,
         error = $3,
         started_at = CASE WHEN $4 THEN now() ELSE started_at END,
         finished_at = CASE WHEN $5 THEN now() ELSE finished_at END
     WHERE id = $1
     RETURNING ${COLUMNS}`,
    [id, nextStatus, error ?? null, isStart, isTerminal],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Rolling Update konnte nicht aktualisiert werden");
  }
  return mapRow(row);
}
