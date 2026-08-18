import { pool } from "./pool";
import type { ClusterEvent, ClusterEventType, CreateClusterEventInput, FailoverHistoryEntry } from "../types/cluster-event.types";

interface ClusterEventRow {
  id: number;
  event_type: ClusterEventType;
  agent_id: string | null;
  message: string;
  metadata: Record<string, unknown> | null;
  created_at: string | Date;
}

function mapRow(row: ClusterEventRow): ClusterEvent {
  return {
    id: row.id,
    eventType: row.event_type,
    agentId: row.agent_id,
    message: row.message,
    metadata: row.metadata,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

const COLUMNS = `id, event_type, agent_id, message, metadata, created_at`;

export async function createClusterEvent(input: CreateClusterEventInput): Promise<ClusterEvent> {
  const { rows } = await pool.query<ClusterEventRow>(
    `INSERT INTO cluster_events (event_type, agent_id, message, metadata)
     VALUES ($1, $2, $3, $4)
     RETURNING ${COLUMNS}`,
    [input.eventType, input.agentId ?? null, input.message, input.metadata ? JSON.stringify(input.metadata) : null],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Cluster-Ereignis konnte nicht gespeichert werden");
  }
  return mapRow(row);
}

export interface ListClusterEventsFilters {
  eventType?: ClusterEventType;
  agentId?: string;
  limit: number;
}

export async function listClusterEvents(filters: ListClusterEventsFilters): Promise<ClusterEvent[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  const add = (sql: string, value: unknown): void => {
    values.push(value);
    conditions.push(sql.replace("$$", `$${values.length}`));
  };
  if (filters.eventType) add("event_type = $$", filters.eventType);
  if (filters.agentId) add("agent_id = $$", filters.agentId);

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  values.push(filters.limit);

  const { rows } = await pool.query<ClusterEventRow>(
    `SELECT ${COLUMNS} FROM cluster_events ${where} ORDER BY created_at DESC LIMIT $${values.length}`,
    values,
  );
  return rows.map(mapRow);
}

// Auftragspunkt 5 "Failover Historie" - FAILOVER_STARTED/FAILOVER_FINISHED
// werden ueber metadata->>'failoverId' verknuepft (siehe core/failover.ts).
// Ein noch nicht abgeschlossener Failover liefert finishedAt=null,
// recoveryTimeMs=null statt eines erfundenen Werts.
export async function getFailoverHistory(limit: number): Promise<FailoverHistoryEntry[]> {
  const { rows } = await pool.query<{
    failover_id: string;
    failed_agent_id: string;
    failed_agent_name: string;
    reassigned_check_count: number;
    started_at: string | Date;
    finished_at: string | Date | null;
  }>(
    `SELECT
       started.metadata->>'failoverId' AS failover_id,
       started.agent_id AS failed_agent_id,
       COALESCE(started.metadata->>'agentName', started.agent_id) AS failed_agent_name,
       COALESCE((finished.metadata->>'reassignedCheckCount')::int, 0) AS reassigned_check_count,
       started.created_at AS started_at,
       finished.created_at AS finished_at
     FROM cluster_events started
     LEFT JOIN cluster_events finished
       ON finished.event_type = 'FAILOVER_FINISHED' AND finished.metadata->>'failoverId' = started.metadata->>'failoverId'
     WHERE started.event_type = 'FAILOVER_STARTED'
     ORDER BY started.created_at DESC
     LIMIT $1`,
    [limit],
  );
  return rows.map((row) => {
    const startedAt = row.started_at instanceof Date ? row.started_at.toISOString() : row.started_at;
    const finishedAt = row.finished_at ? (row.finished_at instanceof Date ? row.finished_at.toISOString() : row.finished_at) : null;
    return {
      failoverId: row.failover_id,
      failedAgentId: row.failed_agent_id,
      failedAgentName: row.failed_agent_name,
      reassignedCheckCount: row.reassigned_check_count,
      startedAt,
      finishedAt,
      recoveryTimeMs: finishedAt ? new Date(finishedAt).getTime() - new Date(startedAt).getTime() : null,
    };
  });
}
