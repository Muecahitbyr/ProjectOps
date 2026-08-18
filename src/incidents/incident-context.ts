import { pool } from "../db/pool";
import type { IncidentAnalysisContext } from "../ai/analysis.types";

const SIMILAR_INCIDENTS_LIMIT = 3;
const RESPONSE_TIME_SAMPLE_SIZE = 10;
const TREND_CHANGE_RATIO = 1.2;

// Zusaetzlicher Kontext fuer die KI-Analyse (Auftragspunkt 8) - komplett aus
// echten, bereits vorhandenen Tabellen (incidents/check_results/checks/
// projects), keine neue Datenquelle und keine erfundenen Werte. Wird genau
// einmal pro neuem Incident aufgerufen (siehe core/monitor.ts), daher
// mehrere kleine Queries statt einer hochoptimierten Sammelabfrage - kein
// Hot-Path.
export async function buildIncidentAnalysisContext(
  projectId: string,
  checkId: string,
  checkType: string,
): Promise<IncidentAnalysisContext> {
  const [similarRows, affectedRows, trendRows] = await Promise.all([
    pool.query<{ title: string; created_at: string | Date; resolved_at: string | Date | null }>(
      `SELECT title, created_at, resolved_at
       FROM incidents
       WHERE check_id = $1 AND resolved = true
       ORDER BY created_at DESC
       LIMIT $2`,
      [checkId, SIMILAR_INCIDENTS_LIMIT],
    ),
    // Andere Projekte mit einem aktuell offenen Incident auf einem Check
    // desselben Typs - reale, sofort abfragbare Korrelation (siehe auch
    // alerts/incident-correlation.ts, das dieselbe Grundidee fuer
    // Root-Incidents nutzt).
    pool.query<{ name: string }>(
      `SELECT DISTINCT p.name
       FROM incidents i
       JOIN checks c ON c.id = i.check_id
       JOIN projects p ON p.id = i.project_id
       WHERE c.type = $1 AND i.resolved = false AND i.project_id != $2`,
      [checkType, projectId],
    ),
    pool.query<{ bucket: string; avg_response_time_ms: string | null }>(
      `SELECT bucket, AVG(response_time_ms) AS avg_response_time_ms FROM (
         SELECT response_time_ms,
                CASE WHEN ROW_NUMBER() OVER (ORDER BY checked_at DESC) <= $2 THEN 'recent' ELSE 'previous' END AS bucket
         FROM check_results
         WHERE check_id = $1 AND response_time_ms IS NOT NULL
         ORDER BY checked_at DESC
         LIMIT $3
       ) sample
       GROUP BY bucket`,
      [checkId, RESPONSE_TIME_SAMPLE_SIZE, RESPONSE_TIME_SAMPLE_SIZE * 2],
    ),
  ]);

  const similarPastIncidents = similarRows.rows.map((row) => ({
    title: row.title,
    occurredAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    resolvedAfterMs:
      row.resolved_at === null
        ? null
        : new Date(row.resolved_at).getTime() - new Date(row.created_at).getTime(),
  }));

  const affectedComponents = affectedRows.rows.map((row) => row.name);

  const recent = trendRows.rows.find((row) => row.bucket === "recent")?.avg_response_time_ms;
  const previous = trendRows.rows.find((row) => row.bucket === "previous")?.avg_response_time_ms;
  let responseTimeTrend: IncidentAnalysisContext["responseTimeTrend"] = "UNKNOWN";
  if (recent !== null && recent !== undefined && previous !== null && previous !== undefined) {
    const recentValue = Number(recent);
    const previousValue = Number(previous);
    if (previousValue > 0 && recentValue > previousValue * TREND_CHANGE_RATIO) {
      responseTimeTrend = "DEGRADING";
    } else if (previousValue > 0 && recentValue < previousValue / TREND_CHANGE_RATIO) {
      responseTimeTrend = "IMPROVING";
    } else {
      responseTimeTrend = "STABLE";
    }
  }

  return { similarPastIncidents, affectedComponents, responseTimeTrend };
}
