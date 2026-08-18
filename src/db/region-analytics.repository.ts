import { pool } from "./pool";
import type { AgentHeartbeatBucket, AgentPerformanceEntry, MaintenanceImpactEntry, RegionAnalyticsEntry } from "../types/region-analytics.types";

// Phase 13 Teil 2 "Geografische Monitoring-Standorte" / Teil 14 "Analytics
// Erweiterung" - alle Abfragen gehen von check_results.agent_id (Migration
// 0031) aus, das seit local-agent.ts/monitor.ts bei jedem Check gesetzt
// wird. Keine Fake-Regionen: COALESCE(...,'unconfigured') statt einer
// erfundenen Standardregion.
export async function getRegionAnalytics(hours: number): Promise<RegionAnalyticsEntry[]> {
  const { rows } = await pool.query<{
    region: string;
    agent_count: string;
    check_count: string;
    avg_response_time: string | null;
    failure_rate: string;
  }>(
    `SELECT COALESCE(ma.region, 'unconfigured') AS region,
            COUNT(DISTINCT ma.id) AS agent_count,
            COUNT(cr.*) AS check_count,
            AVG(cr.response_time_ms) AS avg_response_time,
            (100.0 * COUNT(*) FILTER (WHERE cr.status != 'ONLINE') / NULLIF(COUNT(*), 0)) AS failure_rate
     FROM check_results cr
     JOIN monitoring_agents ma ON ma.id = cr.agent_id
     WHERE cr.checked_at >= now() - ($1 || ' hours')::interval
     GROUP BY COALESCE(ma.region, 'unconfigured')
     ORDER BY region`,
    [hours],
  );
  return rows.map((row) => ({
    region: row.region,
    agentCount: Number(row.agent_count),
    checkCount: Number(row.check_count),
    avgResponseTimeMs: row.avg_response_time !== null ? Math.round(Number(row.avg_response_time)) : null,
    failureRatePercent: Number(row.failure_rate ?? 0),
  }));
}

export async function getAgentPerformance(hours: number): Promise<AgentPerformanceEntry[]> {
  const { rows } = await pool.query<{
    agent_id: string;
    agent_name: string;
    region: string | null;
    check_count: string;
    avg_response_time: string | null;
    failure_rate: string;
  }>(
    `SELECT ma.id AS agent_id, ma.name AS agent_name, ma.region,
            COUNT(cr.*) AS check_count,
            AVG(cr.response_time_ms) AS avg_response_time,
            (100.0 * COUNT(*) FILTER (WHERE cr.status != 'ONLINE') / NULLIF(COUNT(*), 0)) AS failure_rate
     FROM monitoring_agents ma
     LEFT JOIN check_results cr ON cr.agent_id = ma.id AND cr.checked_at >= now() - ($1 || ' hours')::interval
     GROUP BY ma.id, ma.name, ma.region
     ORDER BY ma.name`,
    [hours],
  );
  return rows.map((row) => ({
    agentId: row.agent_id,
    agentName: row.agent_name,
    region: row.region,
    checkCount: Number(row.check_count),
    avgResponseTimeMs: row.avg_response_time !== null ? Math.round(Number(row.avg_response_time)) : null,
    failureRatePercent: Number(row.failure_rate ?? 0),
  }));
}

// Jede system_metrics-Zeile entspricht genau einem echten Heartbeat (siehe
// local-agent.ts: recordSystemMetric() wird bei jedem Heartbeat aufgerufen)
// - Stundenweise Buckets sind daher eine ehrliche Heartbeat-Timeline, keine
// separate Simulation.
export async function getAgentHeartbeatTimeline(agentId: string, hours: number): Promise<AgentHeartbeatBucket[]> {
  const { rows } = await pool.query<{ bucket: string | Date; count: string }>(
    `SELECT date_trunc('hour', recorded_at) AS bucket, COUNT(*) AS count
     FROM system_metrics
     WHERE agent_id = $1 AND recorded_at >= now() - ($2 || ' hours')::interval
     GROUP BY bucket ORDER BY bucket`,
    [agentId, hours],
  );
  return rows.map((row) => ({
    bucketStart: (row.bucket instanceof Date ? row.bucket : new Date(row.bucket)).toISOString(),
    heartbeatCount: Number(row.count),
  }));
}

// Phase 13 Teil 5 "Maintenance Erweiterung" (Analytics-Sichtbarkeit) - fuer
// jedes (auch vergangene) Wartungsfenster: wie viele nicht-ONLINE
// Check-Ergebnisse fielen in dessen Zeitfenster (d.h. waeren ohne die
// Wartungsunterdrueckung als Vorfall/Alert sichtbar geworden).
export async function getMaintenanceImpact(limit: number): Promise<MaintenanceImpactEntry[]> {
  const { rows } = await pool.query<{
    id: number;
    project_id: string;
    reason: string;
    starts_at: string | Date;
    ends_at: string | Date;
    issues_count: string;
  }>(
    `SELECT mw.id, mw.project_id, mw.reason, mw.starts_at, mw.ends_at,
            COUNT(cr.*) FILTER (WHERE cr.status != 'ONLINE') AS issues_count
     FROM maintenance_windows mw
     LEFT JOIN checks c ON c.project_id = mw.project_id
     LEFT JOIN check_results cr ON cr.check_id = c.id AND cr.checked_at >= mw.starts_at AND cr.checked_at < mw.ends_at
     GROUP BY mw.id, mw.project_id, mw.reason, mw.starts_at, mw.ends_at
     ORDER BY mw.starts_at DESC
     LIMIT $1`,
    [limit],
  );
  return rows.map((row) => ({
    maintenanceWindowId: row.id,
    projectId: row.project_id,
    reason: row.reason,
    startsAt: (row.starts_at instanceof Date ? row.starts_at : new Date(row.starts_at)).toISOString(),
    endsAt: (row.ends_at instanceof Date ? row.ends_at : new Date(row.ends_at)).toISOString(),
    issuesObservedDuringWindow: Number(row.issues_count),
  }));
}
