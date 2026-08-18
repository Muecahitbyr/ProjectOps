import { pool } from "./pool";
import type { AgentAssignment, AgentDistributionEntry, DistributionStrategy } from "../types/cluster.types";

interface AgentAssignmentRow {
  check_id: string;
  agent_id: string;
  strategy: DistributionStrategy;
  assigned_at: string | Date;
}

function mapRow(row: AgentAssignmentRow): AgentAssignment {
  return {
    checkId: row.check_id,
    agentId: row.agent_id,
    strategy: row.strategy,
    assignedAt: row.assigned_at instanceof Date ? row.assigned_at.toISOString() : row.assigned_at,
  };
}

export async function listAgentAssignments(): Promise<AgentAssignment[]> {
  const { rows } = await pool.query<AgentAssignmentRow>(`SELECT check_id, agent_id, strategy, assigned_at FROM agent_assignments`);
  return rows.map(mapRow);
}

export async function getAssignmentForCheck(checkId: string): Promise<AgentAssignment | undefined> {
  const { rows } = await pool.query<AgentAssignmentRow>(
    `SELECT check_id, agent_id, strategy, assigned_at FROM agent_assignments WHERE check_id = $1`,
    [checkId],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

// Upsert einer einzelnen Zuweisung (core/distributed-scheduler.ts) - liefert
// zurueck, ob sich der zugewiesene Agent tatsaechlich geaendert hat (fuer
// CHECK_REASSIGNED-Events: keine Meldung, wenn derselbe Agent lediglich
// erneut bestaetigt wird).
export async function upsertAssignment(checkId: string, agentId: string, strategy: DistributionStrategy): Promise<{ changed: boolean; previousAgentId: string | null }> {
  const { rows } = await pool.query<{ agent_id: string }>(`SELECT agent_id FROM agent_assignments WHERE check_id = $1`, [checkId]);
  const previousAgentId = rows[0]?.agent_id ?? null;
  if (previousAgentId === agentId) {
    return { changed: false, previousAgentId };
  }
  await pool.query(
    `INSERT INTO agent_assignments (check_id, agent_id, strategy, assigned_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (check_id) DO UPDATE SET agent_id = EXCLUDED.agent_id, strategy = EXCLUDED.strategy, assigned_at = now()`,
    [checkId, agentId, strategy],
  );
  return { changed: true, previousAgentId };
}

export async function reassignChecksFromAgent(fromAgentId: string, toAgentId: string, strategy: DistributionStrategy): Promise<string[]> {
  const { rows } = await pool.query<{ check_id: string }>(
    `UPDATE agent_assignments SET agent_id = $2, strategy = $3, assigned_at = now()
     WHERE agent_id = $1
     RETURNING check_id`,
    [fromAgentId, toAgentId, strategy],
  );
  return rows.map((row) => row.check_id);
}

export async function getAgentDistribution(): Promise<AgentDistributionEntry[]> {
  const { rows } = await pool.query<{ agent_id: string; agent_name: string; region: string | null; assigned_count: string }>(
    `SELECT ma.id AS agent_id, ma.name AS agent_name, ma.region, COUNT(aa.check_id) AS assigned_count
     FROM monitoring_agents ma
     LEFT JOIN agent_assignments aa ON aa.agent_id = ma.id
     GROUP BY ma.id, ma.name, ma.region
     ORDER BY ma.name`,
  );
  return rows.map((row) => ({
    agentId: row.agent_id,
    agentName: row.agent_name,
    region: row.region,
    assignedCheckCount: Number(row.assigned_count),
  }));
}

export async function countAssignments(): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(`SELECT COUNT(*) AS count FROM agent_assignments`);
  return Number(rows[0]?.count ?? 0);
}

export async function removeAssignmentsForAgent(agentId: string): Promise<void> {
  await pool.query(`DELETE FROM agent_assignments WHERE agent_id = $1`, [agentId]);
}
