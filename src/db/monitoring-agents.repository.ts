import { pool } from "./pool";
import type { AgentLifecycleStatus, MonitoringAgent, MonitoringAgentStatus } from "../types/monitoring-agent.types";

interface MonitoringAgentRow {
  id: string;
  name: string;
  region: string | null;
  hostname: string;
  agent_version: string;
  scheduler_version: string;
  capabilities: string[];
  cpu_info: string | null;
  ram_mb: number | null;
  disk_total_mb: number | null;
  os: string;
  docker_version: string | null;
  last_heartbeat_at: string | Date;
  created_at: string | Date;
  tags: string[];
  tls_fingerprint: string | null;
  node_version: string | null;
  agent_secret_hash: string | null;
  agent_secret_rotated_at: string | Date | null;
  status: AgentLifecycleStatus;
}

// Nach dieser Zeit ohne Heartbeat gilt ein Agent als OFFLINE - etwas ueber
// dem 30s-Standard-Scheduler-Intervall (siehe core/scheduler.ts), damit ein
// einzelner verzoegerter Tick nicht sofort als Ausfall gilt.
const DEGRADED_AFTER_MS = 60_000;
const OFFLINE_AFTER_MS = 120_000;

function deriveStatus(lastHeartbeatAt: string | Date): MonitoringAgentStatus {
  const elapsedMs = Date.now() - new Date(lastHeartbeatAt).getTime();
  if (elapsedMs > OFFLINE_AFTER_MS) return "OFFLINE";
  if (elapsedMs > DEGRADED_AFTER_MS) return "DEGRADED";
  return "ONLINE";
}

function mapRow(row: MonitoringAgentRow): MonitoringAgent {
  return {
    id: row.id,
    name: row.name,
    region: row.region,
    hostname: row.hostname,
    agentVersion: row.agent_version,
    schedulerVersion: row.scheduler_version,
    capabilities: row.capabilities,
    cpuInfo: row.cpu_info,
    ramMb: row.ram_mb,
    diskTotalMb: row.disk_total_mb,
    os: row.os,
    dockerVersion: row.docker_version,
    lastHeartbeatAt: row.last_heartbeat_at instanceof Date ? row.last_heartbeat_at.toISOString() : row.last_heartbeat_at,
    status: deriveStatus(row.last_heartbeat_at),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    tags: row.tags,
    tlsFingerprint: row.tls_fingerprint,
    nodeVersion: row.node_version,
    lifecycleStatus: row.status,
    hasSecret: row.agent_secret_hash !== null,
    secretRotatedAt: row.agent_secret_rotated_at
      ? row.agent_secret_rotated_at instanceof Date
        ? row.agent_secret_rotated_at.toISOString()
        : row.agent_secret_rotated_at
      : null,
  };
}

const COLUMNS = `id, name, region, hostname, agent_version, scheduler_version, capabilities,
  cpu_info, ram_mb, disk_total_mb, os, docker_version, last_heartbeat_at, created_at,
  tags, tls_fingerprint, node_version, agent_secret_hash, agent_secret_rotated_at, status`;

export interface UpsertAgentInput {
  id: string;
  name: string;
  region: string | null;
  hostname: string;
  agentVersion: string;
  schedulerVersion: string;
  capabilities: string[];
  cpuInfo: string | null;
  ramMb: number | null;
  diskTotalMb: number | null;
  os: string;
  dockerVersion: string | null;
}

// Registrierung + Heartbeat in einem: ein Agent, der sich erneut meldet,
// aktualisiert seine Zeile (ON CONFLICT), statt eine zweite anzulegen -
// so bleibt jede agent_id in check_results/system_metrics stabil ueber
// Neustarts hinweg. Ausschliesslich fuer den lokalen, im selben Prozess
// laufenden Agenten (core/local-agent.ts) - braucht kein Secret, da kein
// Netzwerk-Grenzuebertritt stattfindet. Echte Remote-Agenten (Phase 14)
// nutzen stattdessen registerRemoteAgent()/recordRemoteAgentHeartbeat()
// unten, die ueber HTTP + Secret authentifiziert werden.
export async function upsertAgentHeartbeat(input: UpsertAgentInput): Promise<MonitoringAgent> {
  const { rows } = await pool.query<MonitoringAgentRow>(
    `INSERT INTO monitoring_agents
       (id, name, region, hostname, agent_version, scheduler_version, capabilities, cpu_info, ram_mb, disk_total_mb, os, docker_version, last_heartbeat_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, region = EXCLUDED.region, hostname = EXCLUDED.hostname,
       agent_version = EXCLUDED.agent_version, scheduler_version = EXCLUDED.scheduler_version,
       capabilities = EXCLUDED.capabilities, cpu_info = EXCLUDED.cpu_info, ram_mb = EXCLUDED.ram_mb,
       disk_total_mb = EXCLUDED.disk_total_mb, os = EXCLUDED.os, docker_version = EXCLUDED.docker_version,
       last_heartbeat_at = now()
     RETURNING ${COLUMNS}`,
    [
      input.id,
      input.name,
      input.region,
      input.hostname,
      input.agentVersion,
      input.schedulerVersion,
      JSON.stringify(input.capabilities),
      input.cpuInfo,
      input.ramMb,
      input.diskTotalMb,
      input.os,
      input.dockerVersion,
    ],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Agent konnte nicht registriert werden");
  }
  return mapRow(row);
}

export async function listMonitoringAgents(): Promise<MonitoringAgent[]> {
  const { rows } = await pool.query<MonitoringAgentRow>(`SELECT ${COLUMNS} FROM monitoring_agents ORDER BY name`);
  return rows.map(mapRow);
}

export async function getMonitoringAgentById(id: string): Promise<MonitoringAgent | undefined> {
  const { rows } = await pool.query<MonitoringAgentRow>(`SELECT ${COLUMNS} FROM monitoring_agents WHERE id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export interface AgentCheckCount {
  agentId: string;
  checkCount: number;
}

// Teil 1 "Dashboard zeigt: welcher Agent welchen Check ausgefuehrt hat" -
// Anzahl Check-Ausfuehrungen je Agent im Zeitfenster.
export async function getCheckCountsByAgent(hours = 24): Promise<AgentCheckCount[]> {
  const { rows } = await pool.query<{ agent_id: string; check_count: string }>(
    `SELECT agent_id, COUNT(*) AS check_count FROM check_results
     WHERE agent_id IS NOT NULL AND checked_at >= now() - ($1 || ' hours')::interval
     GROUP BY agent_id`,
    [hours],
  );
  return rows.map((row) => ({ agentId: row.agent_id, checkCount: Number(row.check_count) }));
}

// Phase 55 "Enterprise Capacity & Resource Optimization" - "welcher Agent
// bedient dieses Projekt tatsaechlich" (der juengste agent_id-Wert aus
// dessen eigenen check_results) - noetig, um core/decision-context.ts (rein
// projekt-skaliert) mit einem Agent-Kapazitaetsrisiko (rein agent-skaliert,
// siehe core/local-agent.ts#evaluateAgentCapacityIfDue()) zu verknuepfen,
// ohne eine zweite Zuordnungstabelle einzufuehren - dieselbe "derive, don't
// store"-Leitlinie wie ueberall sonst in diesem System.
export async function getLatestAgentIdForProject(projectId: string): Promise<string | null> {
  const { rows } = await pool.query<{ agent_id: string }>(
    `SELECT cr.agent_id FROM check_results cr
     JOIN checks c ON c.id = cr.check_id
     WHERE c.project_id = $1 AND cr.agent_id IS NOT NULL
     ORDER BY cr.checked_at DESC LIMIT 1`,
    [projectId],
  );
  return rows[0]?.agent_id ?? null;
}

// ---------------------------------------------------------------------------
// Phase 14 "Remote Monitoring Agents" / "Agent Discovery" / "Agent Authentication"
// ---------------------------------------------------------------------------

export interface RegisterRemoteAgentInput {
  id: string;
  name: string;
  region: string | null;
  hostname: string;
  agentVersion: string;
  schedulerVersion: string;
  nodeVersion: string | null;
  capabilities: string[];
  tags: string[];
  cpuInfo: string | null;
  ramMb: number | null;
  diskTotalMb: number | null;
  os: string;
  dockerVersion: string | null;
  tlsFingerprint: string | null;
  agentSecretHash: string;
}

// Eigene Funktion statt upsertAgentHeartbeat() wiederzuverwenden: eine
// Registrierung MUSS fehlschlagen, wenn die ID bereits existiert (kein
// stillschweigendes Ueberschreiben eines fremden Agenten durch einen neuen
// Registrierungsversuch) - anders als der Heartbeat-Upsert des lokalen
// Agenten, der bewusst idempotent ist.
export async function registerRemoteAgent(input: RegisterRemoteAgentInput): Promise<MonitoringAgent> {
  const { rows } = await pool.query<MonitoringAgentRow>(
    `INSERT INTO monitoring_agents
       (id, name, region, hostname, agent_version, scheduler_version, node_version, capabilities, tags,
        cpu_info, ram_mb, disk_total_mb, os, docker_version, tls_fingerprint, agent_secret_hash,
        agent_secret_rotated_at, last_heartbeat_at, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, now(), now(), 'ACTIVE')
     RETURNING ${COLUMNS}`,
    [
      input.id,
      input.name,
      input.region,
      input.hostname,
      input.agentVersion,
      input.schedulerVersion,
      input.nodeVersion,
      JSON.stringify(input.capabilities),
      input.tags,
      input.cpuInfo,
      input.ramMb,
      input.diskTotalMb,
      input.os,
      input.dockerVersion,
      input.tlsFingerprint,
      input.agentSecretHash,
    ],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Agent konnte nicht registriert werden");
  }
  return mapRow(row);
}

export interface RemoteAgentHeartbeatInput {
  cpuInfo?: string | null;
  ramMb?: number | null;
  diskTotalMb?: number | null;
}

export async function recordRemoteAgentHeartbeat(agentId: string, input: RemoteAgentHeartbeatInput): Promise<MonitoringAgent | undefined> {
  const { rows } = await pool.query<MonitoringAgentRow>(
    `UPDATE monitoring_agents
     SET last_heartbeat_at = now(),
         cpu_info = COALESCE($2, cpu_info),
         ram_mb = COALESCE($3, ram_mb),
         disk_total_mb = COALESCE($4, disk_total_mb)
     WHERE id = $1
     RETURNING ${COLUMNS}`,
    [agentId, input.cpuInfo ?? null, input.ramMb ?? null, input.diskTotalMb ?? null],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

// Atomarer Replay-Schutz (core/agent-auth.ts): die Sequenz wird nur dann
// (und im selben Statement) erhoeht, wenn Secret-Hash passt UND die neue
// Sequenz strikt groesser als die zuletzt gesehene ist. Kein separates
// SELECT-dann-UPDATE - vermeidet eine Race Condition, bei der zwei
// gleichzeitige Requests mit derselben (abgefangenen) Sequenz beide
// akzeptiert wuerden.
export async function verifyAgentHeartbeatSequence(agentId: string, secretHash: string, sequence: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE monitoring_agents
     SET last_heartbeat_sequence = $3
     WHERE id = $1 AND agent_secret_hash = $2 AND $3 > last_heartbeat_sequence AND status != 'REVOKED'`,
    [agentId, secretHash, sequence],
  );
  return (rowCount ?? 0) > 0;
}

// Rotation setzt zusaetzlich die Sequenz zurueck - ein neues Secret beginnt
// bei Sequenz 0, alte (abgefangene) signierte Sequenzen des vorherigen
// Secrets sind ohnehin durch den Hash-Vergleich schon ungueltig.
export async function rotateAgentSecretHash(agentId: string, newSecretHash: string): Promise<MonitoringAgent | undefined> {
  const { rows } = await pool.query<MonitoringAgentRow>(
    `UPDATE monitoring_agents
     SET agent_secret_hash = $2, agent_secret_rotated_at = now(), last_heartbeat_sequence = 0
     WHERE id = $1
     RETURNING ${COLUMNS}`,
    [agentId, newSecretHash],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function setAgentLifecycleStatus(agentId: string, status: AgentLifecycleStatus): Promise<MonitoringAgent | undefined> {
  const { rows } = await pool.query<MonitoringAgentRow>(
    `UPDATE monitoring_agents SET status = $2 WHERE id = $1 RETURNING ${COLUMNS}`,
    [agentId, status],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export interface UpdateAgentMetadataInput {
  name?: string;
  region?: string | null;
  tags?: string[];
}

export async function updateAgentMetadata(agentId: string, input: UpdateAgentMetadataInput): Promise<MonitoringAgent | undefined> {
  const { rows } = await pool.query<MonitoringAgentRow>(
    `UPDATE monitoring_agents
     SET name = COALESCE($2, name), region = COALESCE($3, region), tags = COALESCE($4, tags)
     WHERE id = $1
     RETURNING ${COLUMNS}`,
    [agentId, input.name ?? null, input.region === undefined ? null : input.region, input.tags ?? null],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function removeAgent(agentId: string): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM monitoring_agents WHERE id = $1`, [agentId]);
  return (rowCount ?? 0) > 0;
}
