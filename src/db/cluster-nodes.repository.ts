import { pool } from "./pool";
import type { ClusterNode, ClusterNodeRole, ClusterNodeStatus } from "../types/cluster.types";

interface ClusterNodeRow {
  id: string;
  role: ClusterNodeRole;
  hostname: string;
  backend_version: string;
  status: ClusterNodeStatus;
  last_heartbeat_at: string | Date;
  created_at: string | Date;
}

const HEARTBEAT_DEGRADED_AFTER_MS = 60_000;
const HEARTBEAT_UNREACHABLE_AFTER_MS = 120_000;

function deriveNodeStatus(lastHeartbeatAt: string | Date): ClusterNodeStatus {
  const elapsedMs = Date.now() - new Date(lastHeartbeatAt).getTime();
  if (elapsedMs > HEARTBEAT_UNREACHABLE_AFTER_MS) return "UNREACHABLE";
  if (elapsedMs > HEARTBEAT_DEGRADED_AFTER_MS) return "DEGRADED";
  return "HEALTHY";
}

function mapRow(row: ClusterNodeRow): ClusterNode {
  return {
    id: row.id,
    role: row.role,
    hostname: row.hostname,
    backendVersion: row.backend_version,
    status: deriveNodeStatus(row.last_heartbeat_at),
    lastHeartbeatAt: row.last_heartbeat_at instanceof Date ? row.last_heartbeat_at.toISOString() : row.last_heartbeat_at,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

const COLUMNS = `id, role, hostname, backend_version, status, last_heartbeat_at, created_at`;

export interface UpsertClusterNodeInput {
  id: string;
  role: ClusterNodeRole;
  hostname: string;
  backendVersion: string;
}

// Analog zu upsertAgentHeartbeat() (Phase 13) - derselbe Knoten aktualisiert
// bei jedem Heartbeat seine eigene Zeile statt eine neue anzulegen.
export async function upsertClusterNodeHeartbeat(input: UpsertClusterNodeInput): Promise<ClusterNode> {
  const { rows } = await pool.query<ClusterNodeRow>(
    `INSERT INTO cluster_nodes (id, role, hostname, backend_version, last_heartbeat_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (id) DO UPDATE SET
       role = EXCLUDED.role, hostname = EXCLUDED.hostname, backend_version = EXCLUDED.backend_version,
       last_heartbeat_at = now()
     RETURNING ${COLUMNS}`,
    [input.id, input.role, input.hostname, input.backendVersion],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Cluster-Knoten konnte nicht registriert werden");
  }
  return mapRow(row);
}

export async function listClusterNodes(): Promise<ClusterNode[]> {
  const { rows } = await pool.query<ClusterNodeRow>(`SELECT ${COLUMNS} FROM cluster_nodes ORDER BY created_at`);
  return rows.map(mapRow);
}
