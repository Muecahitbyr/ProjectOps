import { pool } from "./pool";
import { forecastLinear, type TimeSeriesPoint } from "../analytics/forecast-engine";
import type { ForecastResult } from "../types/forecast.types";

const HISTORY_DAYS = 30;
const FORECAST_DAYS = 7;

async function dailySeries(sql: string, params: unknown[]): Promise<TimeSeriesPoint[]> {
  const { rows } = await pool.query<{ day: string | Date; value: string | null }>(sql, params);
  return rows
    .filter((row) => row.value !== null)
    .map((row) => ({
      timestamp: (row.day instanceof Date ? row.day.toISOString() : row.day),
      value: Number(row.value),
    }));
}

// Teil 10 "Incident Forecast" - taegliche Anzahl neu eroeffneter Incidents.
export async function getIncidentCountForecast(projectId?: string): Promise<ForecastResult> {
  const values: unknown[] = [HISTORY_DAYS];
  const projectFilter = projectId ? (values.push(projectId), `AND project_id = $2`) : "";
  const series = await dailySeries(
    `SELECT date_trunc('day', created_at) AS day, COUNT(*)::text AS value
     FROM incidents WHERE created_at >= now() - ($1 || ' days')::interval ${projectFilter}
     GROUP BY day ORDER BY day`,
    values,
  );
  return forecastLinear("INCIDENT_COUNT", series, FORECAST_DAYS);
}

// Teil 10 "Failure Trend" - taegliche Fehlerquote (nicht-ONLINE) in Prozent.
export async function getFailureRateForecast(projectId?: string): Promise<ForecastResult> {
  const values: unknown[] = [HISTORY_DAYS];
  const projectFilter = projectId ? (values.push(projectId), `AND c.project_id = $2`) : "";
  const series = await dailySeries(
    `SELECT date_trunc('day', cr.checked_at) AS day,
            (100.0 * COUNT(*) FILTER (WHERE cr.status != 'ONLINE') / NULLIF(COUNT(*), 0))::text AS value
     FROM check_results cr JOIN checks c ON c.id = cr.check_id
     WHERE cr.checked_at >= now() - ($1 || ' days')::interval ${projectFilter}
     GROUP BY day ORDER BY day`,
    values,
  );
  return forecastLinear("FAILURE_RATE", series, FORECAST_DAYS);
}

// Teil 10 "Response Time Trend" - taegliche durchschnittliche Antwortzeit.
export async function getResponseTimeForecast(projectId?: string): Promise<ForecastResult> {
  const values: unknown[] = [HISTORY_DAYS];
  const projectFilter = projectId ? (values.push(projectId), `AND c.project_id = $2`) : "";
  const series = await dailySeries(
    `SELECT date_trunc('day', cr.checked_at) AS day, AVG(cr.response_time_ms)::text AS value
     FROM check_results cr JOIN checks c ON c.id = cr.check_id
     WHERE cr.checked_at >= now() - ($1 || ' days')::interval AND cr.response_time_ms IS NOT NULL ${projectFilter}
     GROUP BY day ORDER BY day`,
    values,
  );
  return forecastLinear("RESPONSE_TIME", series, FORECAST_DAYS);
}

// Teil 10 "Health Trend" - taegliche Verfuegbarkeit (% ONLINE) als
// Gesundheits-Proxy.
export async function getHealthScoreForecast(projectId?: string): Promise<ForecastResult> {
  const values: unknown[] = [HISTORY_DAYS];
  const projectFilter = projectId ? (values.push(projectId), `AND c.project_id = $2`) : "";
  const series = await dailySeries(
    `SELECT date_trunc('day', cr.checked_at) AS day,
            (100.0 * COUNT(*) FILTER (WHERE cr.status = 'ONLINE') / NULLIF(COUNT(*), 0))::text AS value
     FROM check_results cr JOIN checks c ON c.id = cr.check_id
     WHERE cr.checked_at >= now() - ($1 || ' days')::interval ${projectFilter}
     GROUP BY day ORDER BY day`,
    values,
  );
  return forecastLinear("HEALTH_SCORE", series, FORECAST_DAYS);
}

// Teil 10 "Disk Growth" - echte, von core/local-agent.ts gesammelte
// Stichproben (system_metrics.disk_used_mb) - kein Fake-Verlauf.
export async function getDiskGrowthForecast(agentId?: string): Promise<ForecastResult> {
  const values: unknown[] = [HISTORY_DAYS];
  const agentFilter = agentId ? (values.push(agentId), `AND agent_id = $2`) : "";
  const series = await dailySeries(
    `SELECT date_trunc('day', recorded_at) AS day, AVG(disk_used_mb)::text AS value
     FROM system_metrics
     WHERE recorded_at >= now() - ($1 || ' days')::interval AND disk_used_mb IS NOT NULL ${agentFilter}
     GROUP BY day ORDER BY day`,
    values,
  );
  return forecastLinear("DISK_USAGE", series, FORECAST_DAYS);
}

// Teil 10 "Capacity Forecast" - Speicherverbrauch (memory_used_mb) als
// Kapazitaets-Signal, ebenfalls aus echten system_metrics-Stichproben.
export async function getCapacityForecast(agentId?: string): Promise<ForecastResult> {
  const values: unknown[] = [HISTORY_DAYS];
  const agentFilter = agentId ? (values.push(agentId), `AND agent_id = $2`) : "";
  const series = await dailySeries(
    `SELECT date_trunc('day', recorded_at) AS day, AVG(memory_used_mb)::text AS value
     FROM system_metrics
     WHERE recorded_at >= now() - ($1 || ' days')::interval AND memory_used_mb IS NOT NULL ${agentFilter}
     GROUP BY day ORDER BY day`,
    values,
  );
  return forecastLinear("CAPACITY", series, FORECAST_DAYS);
}
