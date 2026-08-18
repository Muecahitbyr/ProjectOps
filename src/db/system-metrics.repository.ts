import { pool } from "./pool";

export interface RecordSystemMetricInput {
  agentId: string;
  cpuLoadPercent: number | null;
  memoryUsedMb: number;
  memoryTotalMb: number;
  diskUsedMb: number | null;
  diskTotalMb: number | null;
}

export async function recordSystemMetric(input: RecordSystemMetricInput): Promise<void> {
  await pool.query(
    `INSERT INTO system_metrics (agent_id, cpu_load_percent, memory_used_mb, memory_total_mb, disk_used_mb, disk_total_mb)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [input.agentId, input.cpuLoadPercent, input.memoryUsedMb, input.memoryTotalMb, input.diskUsedMb, input.diskTotalMb],
  );
}

export interface SystemMetricSample {
  recordedAt: string;
  cpuLoadPercent: number | null;
  memoryUsedMb: number | null;
  memoryTotalMb: number | null;
  diskUsedMb: number | null;
  diskTotalMb: number | null;
}

interface SystemMetricRow {
  recorded_at: string | Date;
  cpu_load_percent: number | null;
  memory_used_mb: number | null;
  memory_total_mb: number | null;
  disk_used_mb: number | null;
  disk_total_mb: number | null;
}

function mapRow(row: SystemMetricRow): SystemMetricSample {
  return {
    recordedAt: row.recorded_at instanceof Date ? row.recorded_at.toISOString() : row.recorded_at,
    cpuLoadPercent: row.cpu_load_percent,
    memoryUsedMb: row.memory_used_mb,
    memoryTotalMb: row.memory_total_mb,
    diskUsedMb: row.disk_used_mb,
    diskTotalMb: row.disk_total_mb,
  };
}

// Fuer Diagnostics Center (aktuellster Wert) und Predictive Analytics
// (ganze Zeitreihe fuer die Regression) - agentId optional, um ueber alle
// Agenten hinweg zu aggregieren.
export async function listSystemMetrics(agentId: string | undefined, days: number): Promise<SystemMetricSample[]> {
  const values: unknown[] = [days];
  const agentFilter = agentId ? (values.push(agentId), `AND agent_id = $2`) : "";
  const { rows } = await pool.query<SystemMetricRow>(
    `SELECT recorded_at, cpu_load_percent, memory_used_mb, memory_total_mb, disk_used_mb, disk_total_mb
     FROM system_metrics
     WHERE recorded_at >= now() - ($1 || ' days')::interval ${agentFilter}
     ORDER BY recorded_at ASC`,
    values,
  );
  return rows.map(mapRow);
}

export async function getLatestSystemMetric(agentId: string): Promise<SystemMetricSample | undefined> {
  const { rows } = await pool.query<SystemMetricRow>(
    `SELECT recorded_at, cpu_load_percent, memory_used_mb, memory_total_mb, disk_used_mb, disk_total_mb
     FROM system_metrics WHERE agent_id = $1 ORDER BY recorded_at DESC LIMIT 1`,
    [agentId],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}
