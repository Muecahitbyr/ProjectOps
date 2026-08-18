import { pool } from "./pool";

// Phase 36 "Enterprise Remediation & Change Effectiveness Intelligence" -
// AUSSCHLIESSLICH lesende SQL-Aggregationen ueber bereits bestehende
// Tabellen (incidents, slo_evaluations). Beide Funktionen holen Vorher-
// UND Nachher-Werte in JEWEILS EINER Abfrage (Periode als CASE-Bucket),
// statt zwei getrennter Roundtrips - siehe core/remediation-effectiveness.ts
// fuer die Komposition. Kein N+1: unabhaengig davon, wie viele Incidents/
// SLO-Snapshots im Fenster liegen, bleibt es bei je einer Abfrage pro Change.

export interface IncidentPeriodRow {
  count: number;
  criticalCount: number;
  highCriticalCount: number;
  totalDurationMs: number | null;
  avgMttrMs: number | null;
}

const EMPTY_PERIOD: IncidentPeriodRow = { count: 0, criticalCount: 0, highCriticalCount: 0, totalDurationMs: null, avgMttrMs: null };

export interface IncidentBeforeAfterRaw {
  before: IncidentPeriodRow;
  after: IncidentPeriodRow;
}

// Auftragspunkt 8/9 "Incident Comparison"/"Recurring Incident Comparison" -
// checkIds kommen aus den BEREITS mit dem Problem verknuepften Incidents
// (Phase 35, keine neue Aggregation dafuer noetig) - das IST das
// wiederkehrende Muster, das analysiert werden soll.
export async function getIncidentBeforeAfterForChecks(checkIds: string[], changeTime: Date, windowDays: number): Promise<IncidentBeforeAfterRaw> {
  if (checkIds.length === 0) return { before: EMPTY_PERIOD, after: EMPTY_PERIOD };
  const beforeStart = new Date(changeTime.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const afterEnd = new Date(changeTime.getTime() + windowDays * 24 * 60 * 60 * 1000);

  const { rows } = await pool.query<{
    period: "before" | "after";
    count: string;
    critical_count: string;
    high_critical_count: string;
    total_duration_seconds: string | null;
    avg_mttr_seconds: string | null;
  }>(
    `SELECT
       CASE WHEN created_at < $2 THEN 'before' ELSE 'after' END AS period,
       COUNT(*) AS count,
       COUNT(*) FILTER (WHERE severity = 'CRITICAL') AS critical_count,
       COUNT(*) FILTER (WHERE severity IN ('HIGH', 'CRITICAL')) AS high_critical_count,
       SUM(EXTRACT(EPOCH FROM (resolved_at - created_at))) FILTER (WHERE resolved) AS total_duration_seconds,
       AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))) FILTER (WHERE resolved) AS avg_mttr_seconds
     FROM incidents
     WHERE check_id = ANY($1) AND created_at >= $3 AND created_at < $4
     GROUP BY period`,
    [checkIds, changeTime.toISOString(), beforeStart.toISOString(), afterEnd.toISOString()],
  );

  const result: IncidentBeforeAfterRaw = { before: { ...EMPTY_PERIOD }, after: { ...EMPTY_PERIOD } };
  for (const row of rows) {
    const stats: IncidentPeriodRow = {
      count: Number(row.count),
      criticalCount: Number(row.critical_count),
      highCriticalCount: Number(row.high_critical_count),
      totalDurationMs: row.total_duration_seconds !== null ? Math.round(Number(row.total_duration_seconds) * 1000) : null,
      avgMttrMs: row.avg_mttr_seconds !== null ? Math.round(Number(row.avg_mttr_seconds) * 1000) : null,
    };
    result[row.period] = stats;
  }
  return result;
}

export interface SloPeriodRow {
  avgSliValue: number | null;
  latestSliValue: number | null;
  latestStatus: string | null;
  avgBurnRate: number | null;
  latestBurnRate: number | null;
  sampleCount: number;
}

const EMPTY_SLO_PERIOD: SloPeriodRow = { avgSliValue: null, latestSliValue: null, latestStatus: null, avgBurnRate: null, latestBurnRate: null, sampleCount: 0 };

// Auftragspunkt 10/11 "SLO Integration"/"Error Budget Impact" - EINE
// Abfrage fuer ALLE betroffenen SLOs UND beide Perioden zusammen (GROUP BY
// slo_id, period). "latest" wird ueber ein LATERAL je (slo_id, period)
// aufgeloest, damit "der letzte Snapshot in diesem Fenster" praezise ist
// (nicht nur ein beliebiger Wert aus AVG).
export async function getSloBeforeAfter(sloIds: number[], changeTime: Date, windowDays: number): Promise<Map<number, { before: SloPeriodRow; after: SloPeriodRow }>> {
  if (sloIds.length === 0) return new Map();
  const beforeStart = new Date(changeTime.getTime() - windowDays * 24 * 60 * 60 * 1000);
  const afterEnd = new Date(changeTime.getTime() + windowDays * 24 * 60 * 60 * 1000);

  const { rows } = await pool.query<{
    slo_id: number;
    period: "before" | "after";
    avg_sli: string | null;
    avg_burn_rate: string | null;
    sample_count: string;
    latest_sli: string | null;
    latest_status: string | null;
    latest_burn_rate: string | null;
  }>(
    `WITH scoped AS (
       SELECT slo_id, evaluated_at, sli_value, burn_rate, status,
              CASE WHEN evaluated_at < $2 THEN 'before' ELSE 'after' END AS period
       FROM slo_evaluations
       WHERE slo_id = ANY($1) AND evaluated_at >= $3 AND evaluated_at < $4
     ),
     latest AS (
       SELECT DISTINCT ON (slo_id, period) slo_id, period, sli_value AS latest_sli, status AS latest_status, burn_rate AS latest_burn_rate
       FROM scoped
       ORDER BY slo_id, period, evaluated_at DESC
     )
     SELECT s.slo_id, s.period,
            AVG(s.sli_value) AS avg_sli, AVG(s.burn_rate) AS avg_burn_rate, COUNT(*) AS sample_count,
            l.latest_sli, l.latest_status, l.latest_burn_rate
     FROM scoped s
     JOIN latest l ON l.slo_id = s.slo_id AND l.period = s.period
     GROUP BY s.slo_id, s.period, l.latest_sli, l.latest_status, l.latest_burn_rate`,
    [sloIds, changeTime.toISOString(), beforeStart.toISOString(), afterEnd.toISOString()],
  );

  const result = new Map<number, { before: SloPeriodRow; after: SloPeriodRow }>();
  for (const row of rows) {
    const sloId = Number(row.slo_id);
    const entry = result.get(sloId) ?? { before: { ...EMPTY_SLO_PERIOD }, after: { ...EMPTY_SLO_PERIOD } };
    entry[row.period] = {
      avgSliValue: row.avg_sli !== null ? Number(row.avg_sli) : null,
      latestSliValue: row.latest_sli !== null ? Number(row.latest_sli) : null,
      latestStatus: row.latest_status,
      avgBurnRate: row.avg_burn_rate !== null ? Number(row.avg_burn_rate) : null,
      latestBurnRate: row.latest_burn_rate !== null ? Number(row.latest_burn_rate) : null,
      sampleCount: Number(row.sample_count),
    };
    result.set(sloId, entry);
  }
  return result;
}
