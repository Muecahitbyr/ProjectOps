import { pool } from "./pool";
import { getAllProjectsHealth, getProjectHealth } from "./dashboard.repository";
import { healthScoreConfig, SUCCESSFUL_CHECK_STATUSES } from "../config/health.config";
import type { CheckStatus } from "../types/check-result.types";
import type { IncidentSeverity } from "../types/incident.types";
import type {
  AnalyticsRange,
  AnalyticsSummary,
  DrillDownFilters,
  DrillDownResult,
  DrillDownRow,
  FrequencyEntry,
  HeatmapCell,
  HistoryBucket,
  IncidentAnalytics,
  IncidentDurationStats,
  ProjectComparison,
  ProjectComparisonSide,
  ProjectHistory,
  ProjectSla,
  RankedProject,
  ResponseTimeAnalytics,
  ResponseTimeHistogramBucket,
  ResponseTimeStats,
  WeekdayEntry,
} from "../types/analytics.types";

// ---------------------------------------------------------------------------
// Zeitfenster/Bucketing - gemeinsam fuer alle Verlaufs-/Analytics-Endpunkte.
// ---------------------------------------------------------------------------

const RANGE_WINDOW_HOURS: Record<Exclude<AnalyticsRange, "custom">, number> = {
  "1h": 1,
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
};

// Feste Bucket-Groessen je Standard-Zeitraum (ausgewaehlt fuer eine gut
// lesbare Punktzahl im Chart: 30-48 Punkte). Bei "custom" wird die
// Bucket-Groesse aus der tatsaechlichen Spannweite abgeleitet (Zielwert
// ~60 Punkte, min. 1 Minute, max. 1 Tag je Bucket).
const RANGE_BUCKET_MINUTES: Record<Exclude<AnalyticsRange, "custom">, number> = {
  "1h": 2,
  "24h": 30,
  "7d": 240,
  "30d": 1440,
};

const CUSTOM_TARGET_BUCKETS = 60;
const MIN_BUCKET_MINUTES = 1;
const MAX_BUCKET_MINUTES = 1440;

export interface TimeWindow {
  from: Date;
  to: Date;
  bucketMinutes: number;
}

export function resolveTimeWindow(range: AnalyticsRange, fromParam?: string, toParam?: string): TimeWindow {
  if (range === "custom") {
    if (!fromParam || !toParam) {
      throw new Error("from/to sind fuer range=custom erforderlich");
    }
    const from = new Date(fromParam);
    const to = new Date(toParam);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      throw new Error("Ungueltiger benutzerdefinierter Zeitraum");
    }
    const spanMinutes = (to.getTime() - from.getTime()) / 60_000;
    const bucketMinutes = Math.min(
      MAX_BUCKET_MINUTES,
      Math.max(MIN_BUCKET_MINUTES, Math.ceil(spanMinutes / CUSTOM_TARGET_BUCKETS)),
    );
    return { from, to, bucketMinutes };
  }

  const hours = RANGE_WINDOW_HOURS[range];
  const to = new Date();
  const from = new Date(to.getTime() - hours * 60 * 60 * 1000);
  return { from, to, bucketMinutes: RANGE_BUCKET_MINUTES[range] };
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

// Postgres liefert EXTRACT(EPOCH ...)/AVG/... als "double precision", der
// pg-Treiber parst das bereits zu number - Number(...) ist hier nur ein
// Schutz gegen den Fall NULL bzw. eine string-Repraesentation.
function msOrNull(seconds: string | number | null): number | null {
  return seconds === null ? null : Math.round(Number(seconds) * 1000);
}

const CHECK_TYPE_LABELS: Record<string, string> = {
  http: "HTTP",
  ssl: "SSL/TLS Certificate",
  dns: "DNS",
  "response-time": "Response Time",
  "firebase-status": "Firebase Status",
  firestore: "Firestore",
  stripe: "Stripe",
  "api-health": "API Health",
  custom: "Custom",
};

function labelForCheckType(type: string): string {
  return CHECK_TYPE_LABELS[type] ?? type;
}

function mapFrequencyRows(rows: Array<{ key: string; count: string }>, labelize: (key: string) => string): FrequencyEntry[] {
  return rows.map((row) => ({ key: row.key, label: labelize(row.key), count: Number(row.count) }));
}

// ---------------------------------------------------------------------------
// Incident-Dauer/MTTR/MTBF - gemeinsam fuer Summary, SLA und Incident
// Analytics verwendet (eine Implementierung statt drei fast identischer
// Abfragen). avgDurationMs bezieht laufende (nicht geloeste) Incidents mit
// ein (COALESCE(resolved_at, now())) und beschreibt damit den aktuellen
// Gesamtzustand; mttrMs/longestMs/shortestMs werten bewusst nur bereits
// geloeste Incidents aus - ein noch offener Incident hat noch keine
// abgeschlossene Recovery-Zeit und wuerde "laengster/kuerzester Ausfall"
// verzerren, waehrend er fuer avgDurationMs (aktuelle Ausfalldauer) sehr wohl
// relevant ist.
// ---------------------------------------------------------------------------
export async function getIncidentDurationStats(scope: {
  projectId?: string;
  // Phase 33 "Enterprise Reliability Intelligence & Incident Learning" -
  // additiv, fuer organisationsweite (Mehr-Projekt-)Filterung und Severity-
  // Filter. Bestehende Aufrufer mit nur `projectId` bleiben unveraendert
  // gueltig.
  projectIds?: string[];
  severity?: string;
  from: Date;
  to: Date;
}): Promise<IncidentDurationStats> {
  const conditions = ["created_at >= $1", "created_at < $2"];
  const values: unknown[] = [scope.from.toISOString(), scope.to.toISOString()];
  if (scope.projectId) {
    values.push(scope.projectId);
    conditions.push(`project_id = $${values.length}`);
  } else if (scope.projectIds !== undefined) {
    values.push(scope.projectIds);
    conditions.push(`project_id = ANY($${values.length})`);
  }
  if (scope.severity !== undefined) {
    values.push(scope.severity);
    conditions.push(`severity = $${values.length}`);
  }
  const where = conditions.join(" AND ");

  const { rows } = await pool.query<{
    count: string;
    avg_duration_seconds: string | null;
    mttr_seconds: string | null;
    longest_seconds: string | null;
    shortest_seconds: string | null;
  }>(
    `SELECT
       COUNT(*) AS count,
       AVG(EXTRACT(EPOCH FROM (COALESCE(resolved_at, now()) - created_at))) AS avg_duration_seconds,
       AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))) FILTER (WHERE resolved) AS mttr_seconds,
       MAX(EXTRACT(EPOCH FROM (resolved_at - created_at))) FILTER (WHERE resolved) AS longest_seconds,
       MIN(EXTRACT(EPOCH FROM (resolved_at - created_at))) FILTER (WHERE resolved) AS shortest_seconds
     FROM incidents
     WHERE ${where}`,
    values,
  );

  const { rows: mtbfRows } = await pool.query<{ mtbf_seconds: string | null }>(
    `SELECT AVG(EXTRACT(EPOCH FROM (created_at - prev_created_at))) AS mtbf_seconds
     FROM (
       SELECT created_at, LAG(created_at) OVER (ORDER BY created_at) AS prev_created_at
       FROM incidents
       WHERE ${where}
     ) gaps
     WHERE prev_created_at IS NOT NULL`,
    values,
  );

  const row = rows[0];
  return {
    count: Number(row?.count ?? 0),
    avgDurationMs: msOrNull(row?.avg_duration_seconds ?? null),
    mttrMs: msOrNull(row?.mttr_seconds ?? null),
    mtbfMs: msOrNull(mtbfRows[0]?.mtbf_seconds ?? null),
    longestMs: msOrNull(row?.longest_seconds ?? null),
    shortestMs: msOrNull(row?.shortest_seconds ?? null),
  };
}

// Reine Durchschnitts-Antwortzeit ueber einen Zeitraum (fuer Summary und
// Projektvergleich) - keine Perzentile/Histogramm, dafuer siehe
// getResponseTimeAnalytics().
async function getAvgResponseTimeMs(projectId: string | undefined, from: Date, to: Date): Promise<number | null> {
  const conditions = ["c.enabled = true", "cr.checked_at >= $1", "cr.checked_at < $2"];
  const values: unknown[] = [from.toISOString(), to.toISOString()];
  if (projectId) {
    values.push(projectId);
    conditions.push(`c.project_id = $${values.length}`);
  }

  const { rows } = await pool.query<{ avg_ms: string | null }>(
    `SELECT AVG(cr.response_time_ms) AS avg_ms
     FROM check_results cr JOIN checks c ON c.id = cr.check_id
     WHERE ${conditions.join(" AND ")}`,
    values,
  );
  const avg = rows[0]?.avg_ms;
  return avg === null || avg === undefined ? null : Math.round(Number(avg));
}

async function getAvailabilityPercent(projectId: string | undefined, from: Date, to: Date): Promise<number> {
  const conditions = ["c.enabled = true", "cr.checked_at >= $1", "cr.checked_at < $2"];
  const values: unknown[] = [from.toISOString(), to.toISOString()];
  if (projectId) {
    values.push(projectId);
    conditions.push(`c.project_id = $${values.length}`);
  }
  values.push(SUCCESSFUL_CHECK_STATUSES);
  const successParam = `$${values.length}`;

  const { rows } = await pool.query<{ total: string; success: string }>(
    `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE cr.status = ANY(${successParam}::text[])) AS success
     FROM check_results cr JOIN checks c ON c.id = cr.check_id
     WHERE ${conditions.join(" AND ")}`,
    values,
  );
  const total = Number(rows[0]?.total ?? 0);
  const success = Number(rows[0]?.success ?? 0);
  return total === 0 ? healthScoreConfig.maxScore : Number(((success / total) * 100).toFixed(2));
}

async function getIncidentCounts(
  projectId: string | undefined,
  from: Date,
  to: Date,
): Promise<{ total: number; open: number; resolved: number }> {
  const conditions = ["created_at >= $1", "created_at < $2"];
  const values: unknown[] = [from.toISOString(), to.toISOString()];
  if (projectId) {
    values.push(projectId);
    conditions.push(`project_id = $${values.length}`);
  }

  const { rows } = await pool.query<{ total: string; open: string; resolved: string }>(
    `SELECT COUNT(*) AS total,
            COUNT(*) FILTER (WHERE resolved = false) AS open,
            COUNT(*) FILTER (WHERE resolved = true) AS resolved
     FROM incidents WHERE ${conditions.join(" AND ")}`,
    values,
  );
  const row = rows[0];
  return { total: Number(row?.total ?? 0), open: Number(row?.open ?? 0), resolved: Number(row?.resolved ?? 0) };
}

// ---------------------------------------------------------------------------
// 1. Analytics Summary (GET /api/analytics/summary)
// ---------------------------------------------------------------------------

async function getTopAndStableProjects(from: Date, to: Date): Promise<{ critical: RankedProject[]; stable: RankedProject[] }> {
  const [health, incidentRows, availabilityRows] = await Promise.all([
    getAllProjectsHealth(),
    pool.query<{ project_id: string; incidents_in_window: string; critical_in_window: string }>(
      `SELECT project_id, COUNT(*) AS incidents_in_window,
              COUNT(*) FILTER (WHERE severity = 'CRITICAL') AS critical_in_window
       FROM incidents WHERE created_at >= $1 AND created_at < $2
       GROUP BY project_id`,
      [from.toISOString(), to.toISOString()],
    ),
    pool.query<{ project_id: string; total: string; success: string }>(
      `SELECT c.project_id, COUNT(*) AS total, COUNT(*) FILTER (WHERE cr.status = ANY($3::text[])) AS success
       FROM check_results cr JOIN checks c ON c.id = cr.check_id
       WHERE c.enabled = true AND cr.checked_at >= $1 AND cr.checked_at < $2
       GROUP BY c.project_id`,
      [from.toISOString(), to.toISOString(), SUCCESSFUL_CHECK_STATUSES],
    ),
  ]);

  const incidentsByProject = new Map(
    incidentRows.rows.map((row) => [row.project_id, { total: Number(row.incidents_in_window), critical: Number(row.critical_in_window) }]),
  );
  const availabilityByProject = new Map(
    availabilityRows.rows.map((row) => [row.project_id, { total: Number(row.total), success: Number(row.success) }]),
  );

  const ranked: RankedProject[] = health.map((project) => {
    const incidentStats = incidentsByProject.get(project.id) ?? { total: 0, critical: 0 };
    const availabilityStats = availabilityByProject.get(project.id);
    const availability = !availabilityStats || availabilityStats.total === 0
      ? healthScoreConfig.maxScore
      : Number(((availabilityStats.success / availabilityStats.total) * 100).toFixed(2));

    return {
      projectId: project.id,
      projectName: project.name,
      healthScore: project.health.score,
      openIncidents: project.openIncidents,
      incidentsInWindow: incidentStats.total,
      criticalIncidentsInWindow: incidentStats.critical,
      availability,
    };
  });

  const critical = [...ranked]
    .sort(
      (a, b) =>
        b.openIncidents - a.openIncidents ||
        b.criticalIncidentsInWindow - a.criticalIncidentsInWindow ||
        b.incidentsInWindow - a.incidentsInWindow ||
        a.healthScore - b.healthScore,
    )
    .slice(0, 10);

  const stable = [...ranked]
    .sort(
      (a, b) =>
        a.incidentsInWindow - b.incidentsInWindow ||
        a.openIncidents - b.openIncidents ||
        b.healthScore - a.healthScore ||
        b.availability - a.availability,
    )
    .slice(0, 10);

  return { critical, stable };
}

// Phase 33 "Enterprise Reliability Intelligence & Incident Learning" -
// `projectId` additiv um `string[]` erweitert (organisationsweite Filterung
// ueber mehrere Projekte, siehe core/reliability-intelligence.ts), bestehende
// Aufrufer mit einem einzelnen `string | undefined` bleiben unveraendert
// gueltig.
async function getTopFrequency(
  scope: "error-types" | "incident-causes",
  projectId: string | string[] | undefined,
  from: Date,
  to: Date,
  limit = 10,
): Promise<FrequencyEntry[]> {
  const conditions: string[] = [];
  const values: unknown[] = [from.toISOString(), to.toISOString()];
  let sql: string;

  const addProjectFilter = (column: string): void => {
    if (!projectId) return;
    values.push(projectId);
    conditions.push(Array.isArray(projectId) ? `${column} = ANY($${values.length})` : `${column} = $${values.length}`);
  };

  if (scope === "error-types") {
    conditions.push("cr.status IN ('ERROR', 'OFFLINE')", "cr.checked_at >= $1", "cr.checked_at < $2");
    addProjectFilter("c.project_id");
    sql = `SELECT c.type AS key, COUNT(*) AS count
           FROM check_results cr JOIN checks c ON c.id = cr.check_id
           WHERE ${conditions.join(" AND ")}
           GROUP BY c.type ORDER BY count DESC LIMIT ${limit}`;
  } else {
    conditions.push("i.created_at >= $1", "i.created_at < $2");
    addProjectFilter("i.project_id");
    sql = `SELECT c.type AS key, COUNT(*) AS count
           FROM incidents i JOIN checks c ON c.id = i.check_id
           WHERE ${conditions.join(" AND ")}
           GROUP BY c.type ORDER BY count DESC LIMIT ${limit}`;
  }

  const { rows } = await pool.query<{ key: string; count: string }>(sql, values);
  return mapFrequencyRows(rows, labelForCheckType);
}

export async function getAnalyticsSummary(options: { projectId?: string; hours?: number } = {}): Promise<AnalyticsSummary> {
  const hours = options.hours ?? 24 * 30;
  const to = new Date();
  const from = new Date(to.getTime() - hours * 60 * 60 * 1000);

  const [
    healthScore,
    avgResponseTimeMs,
    availability24h,
    availability7d,
    availability30d,
    incidents,
    durationStats,
    rankedProjects,
    mostCommonErrorTypes,
    mostCommonIncidentCauses,
  ] = await Promise.all([
    options.projectId
      ? getProjectHealth(options.projectId).then((p) => p?.health.score ?? 0)
      : getAllProjectsHealth().then((all) => (all.length === 0 ? 0 : Math.round(all.reduce((sum, p) => sum + p.health.score, 0) / all.length))),
    getAvgResponseTimeMs(options.projectId, from, to),
    getAvailabilityPercent(options.projectId, new Date(to.getTime() - 24 * 60 * 60 * 1000), to),
    getAvailabilityPercent(options.projectId, new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000), to),
    getAvailabilityPercent(options.projectId, new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000), to),
    getIncidentCounts(options.projectId, from, to),
    getIncidentDurationStats({ ...(options.projectId ? { projectId: options.projectId } : {}), from, to }),
    getTopAndStableProjects(from, to),
    getTopFrequency("error-types", options.projectId, from, to),
    getTopFrequency("incident-causes", options.projectId, from, to),
  ]);

  return {
    generatedAt: to.toISOString(),
    windowHours: hours,
    avgHealthScore: healthScore,
    avgResponseTimeMs,
    availability24h,
    availability7d,
    availability30d,
    incidents,
    avgIncidentDurationMs: durationStats.avgDurationMs,
    avgRecoveryTimeMs: durationStats.mttrMs,
    topCriticalProjects: rankedProjects.critical,
    topStableProjects: rankedProjects.stable,
    mostCommonErrorTypes,
    mostCommonIncidentCauses,
  };
}

// ---------------------------------------------------------------------------
// 2. Historische Diagramme (GET /api/analytics/projects/:id/history)
// ---------------------------------------------------------------------------

const CHECK_STATUS_PENALTY_SQL = `CASE cr.status
  WHEN 'ONLINE' THEN 0
  WHEN 'WARNING' THEN ${healthScoreConfig.warningPenalty}
  WHEN 'ERROR' THEN ${healthScoreConfig.errorPenalty}
  WHEN 'OFFLINE' THEN ${healthScoreConfig.offlinePenalty}
  ELSE 0
END`;

interface HistoryBucketRow {
  bucket_start: string | Date;
  sample_count: string;
  avg_response_time_ms: string | null;
  min_response_time_ms: number | null;
  max_response_time_ms: number | null;
  p25_response_time_ms: string | null;
  p75_response_time_ms: string | null;
  success_count: string;
  penalty_sum: string | null;
}

// Gemeinsame Bucket-Abfrage fuer Health/Response-Time/Error-Rate/
// Availability - sowohl fuer getProjectHistory() (Projekt-Verlauf) als auch
// fuer das "series"-Feld in getResponseTimeAnalytics() (optional zusaetzlich
// nach einem einzelnen Check gefiltert) verwendet, um die Bucketing-Logik
// nicht doppelt zu pflegen.
async function queryResponseHistoryBuckets(
  filters: { projectId?: string; checkId?: string },
  from: Date,
  to: Date,
  bucketMinutes: number,
): Promise<Map<string, HistoryBucketRow>> {
  const conditions = ["c.enabled = true", "cr.checked_at >= $2", "cr.checked_at < $3"];
  const values: unknown[] = [`${bucketMinutes} minutes`, from.toISOString(), to.toISOString()];

  if (filters.projectId) {
    values.push(filters.projectId);
    conditions.push(`c.project_id = $${values.length}`);
  }
  if (filters.checkId) {
    values.push(filters.checkId);
    conditions.push(`cr.check_id = $${values.length}`);
  }
  values.push(SUCCESSFUL_CHECK_STATUSES);
  const successParam = `$${values.length}`;

  const { rows } = await pool.query<HistoryBucketRow>(
    `SELECT
       date_bin($1::interval, cr.checked_at, $2::timestamptz) AS bucket_start,
       COUNT(*) AS sample_count,
       AVG(cr.response_time_ms) AS avg_response_time_ms,
       MIN(cr.response_time_ms) AS min_response_time_ms,
       MAX(cr.response_time_ms) AS max_response_time_ms,
       PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY cr.response_time_ms) AS p25_response_time_ms,
       PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY cr.response_time_ms) AS p75_response_time_ms,
       COUNT(*) FILTER (WHERE cr.status = ANY(${successParam}::text[])) AS success_count,
       SUM(${CHECK_STATUS_PENALTY_SQL}) AS penalty_sum
     FROM check_results cr JOIN checks c ON c.id = cr.check_id
     WHERE ${conditions.join(" AND ")}
     GROUP BY bucket_start`,
    values,
  );

  return new Map(rows.map((row) => [toIsoString(row.bucket_start), row]));
}

async function queryIncidentCountBuckets(
  projectId: string | undefined,
  from: Date,
  to: Date,
  bucketMinutes: number,
): Promise<Map<string, number>> {
  const conditions = ["created_at >= $2", "created_at < $3"];
  const values: unknown[] = [`${bucketMinutes} minutes`, from.toISOString(), to.toISOString()];
  if (projectId) {
    values.push(projectId);
    conditions.push(`project_id = $${values.length}`);
  }

  const { rows } = await pool.query<{ bucket_start: string | Date; count: string }>(
    `SELECT date_bin($1::interval, created_at, $2::timestamptz) AS bucket_start, COUNT(*) AS count
     FROM incidents WHERE ${conditions.join(" AND ")}
     GROUP BY bucket_start`,
    values,
  );

  return new Map(rows.map((row) => [toIsoString(row.bucket_start), Number(row.count)]));
}

// Muss exakt dieselben Bucket-Grenzen erzeugen wie date_bin(...) in SQL
// (queryResponseHistoryBuckets/queryIncidentCountBuckets), da die Ergebnisse
// ueber den ISO-String als Schluessel gemerged werden. date_bin() verankert
// die Buckets am uebergebenen Origin-Parameter (hier: "from"), nicht an der
// Unix-Epoche - die Zeitachse muss deshalb ebenfalls bei "from" beginnen.
function buildBucketTimeline(from: Date, to: Date, bucketMinutes: number): string[] {
  const bucketMs = bucketMinutes * 60 * 1000;
  const timestamps: string[] = [];
  for (let t = from.getTime(); t < to.getTime(); t += bucketMs) {
    timestamps.push(new Date(t).toISOString());
  }
  return timestamps;
}

function toHistoryBucket(bucketStart: string, row: HistoryBucketRow | undefined, incidentCount: number): HistoryBucket {
  const sampleCount = row ? Number(row.sample_count) : 0;
  if (sampleCount === 0 || !row) {
    return {
      bucketStart,
      healthScore: null,
      avgResponseTimeMs: null,
      minResponseTimeMs: null,
      maxResponseTimeMs: null,
      p25ResponseTimeMs: null,
      p75ResponseTimeMs: null,
      incidentCount,
      errorRate: null,
      availability: null,
      sampleCount: 0,
    };
  }

  const successCount = Number(row.success_count);
  const penaltySum = row.penalty_sum === null ? 0 : Number(row.penalty_sum);
  const avgPenalty = penaltySum / sampleCount;

  return {
    bucketStart,
    healthScore: Math.max(healthScoreConfig.minScore, Math.round(healthScoreConfig.maxScore - avgPenalty)),
    avgResponseTimeMs: row.avg_response_time_ms === null ? null : Math.round(Number(row.avg_response_time_ms)),
    minResponseTimeMs: row.min_response_time_ms,
    maxResponseTimeMs: row.max_response_time_ms,
    p25ResponseTimeMs: row.p25_response_time_ms === null ? null : Math.round(Number(row.p25_response_time_ms)),
    p75ResponseTimeMs: row.p75_response_time_ms === null ? null : Math.round(Number(row.p75_response_time_ms)),
    incidentCount,
    errorRate: Number((((sampleCount - successCount) / sampleCount) * 100).toFixed(2)),
    availability: Number(((successCount / sampleCount) * 100).toFixed(2)),
    sampleCount,
  };
}

export async function getProjectHistory(
  projectId: string,
  range: AnalyticsRange,
  fromParam?: string,
  toParam?: string,
): Promise<ProjectHistory> {
  const { from, to, bucketMinutes } = resolveTimeWindow(range, fromParam, toParam);

  const [responseBuckets, incidentBuckets] = await Promise.all([
    queryResponseHistoryBuckets({ projectId }, from, to, bucketMinutes),
    queryIncidentCountBuckets(projectId, from, to, bucketMinutes),
  ]);

  const timeline = buildBucketTimeline(from, to, bucketMinutes);
  const buckets = timeline.map((bucketStart) =>
    toHistoryBucket(bucketStart, responseBuckets.get(bucketStart), incidentBuckets.get(bucketStart) ?? 0),
  );

  return { projectId, range, from: from.toISOString(), to: to.toISOString(), bucketMinutes, buckets };
}

// ---------------------------------------------------------------------------
// 3. SLA & Uptime (GET /api/analytics/projects/:id/sla)
//
// Downtime/Uptime/Ausfallzahl werden ueber PostgreSQL-Multiranges
// (range_agg, PG >= 14) berechnet: ueberlappende Incident-Intervalle
// mehrerer Checks desselben Projekts werden zu zusammenhaengenden
// Ausfallfenstern verschmolzen, bevor die Dauer summiert wird. Ohne diesen
// Schritt wuerde ein gleichzeitiger Ausfall von zwei Checks doppelt
// gezaehlt - "Gesamt-Downtime" beschreibt die tatsaechliche Wanduhrzeit, in
// der das Projekt als Ganzes beeintraechtigt war, nicht die Summe aller
// Einzel-Incidents. MTTR/MTBF bleiben bewusst auf einzelnen
// Incident-Ereignissen (nicht verschmolzenen Fenstern), da das die
// Standard-SRE-Definition ist.
// ---------------------------------------------------------------------------
export async function getProjectSla(projectId: string, hours: number): Promise<ProjectSla> {
  const to = new Date();
  const from = new Date(to.getTime() - hours * 60 * 60 * 1000);

  const [availabilityPercent, durationStats, outageRows, firstSampleRows] = await Promise.all([
    getAvailabilityPercent(projectId, from, to),
    getIncidentDurationStats({ projectId, from, to }),
    pool.query<{
      outage_count: string;
      downtime_seconds: string | null;
      avg_outage_seconds: string | null;
      longest_outage_seconds: string | null;
      shortest_outage_seconds: string | null;
    }>(
      `WITH merged AS (
         SELECT unnest(
           COALESCE(
             range_agg(tstzrange(GREATEST(created_at, $1::timestamptz), LEAST(COALESCE(resolved_at, now()), $2::timestamptz))),
             '{}'::tstzmultirange
           )
         ) AS r
         FROM incidents
         WHERE project_id = $3 AND created_at < $2::timestamptz AND COALESCE(resolved_at, now()) > $1::timestamptz
       )
       SELECT
         COUNT(*) AS outage_count,
         COALESCE(SUM(EXTRACT(EPOCH FROM (upper(r) - lower(r)))), 0) AS downtime_seconds,
         AVG(EXTRACT(EPOCH FROM (upper(r) - lower(r)))) AS avg_outage_seconds,
         MAX(EXTRACT(EPOCH FROM (upper(r) - lower(r)))) AS longest_outage_seconds,
         MIN(EXTRACT(EPOCH FROM (upper(r) - lower(r)))) AS shortest_outage_seconds
       FROM merged`,
      [from.toISOString(), to.toISOString(), projectId],
    ),
    // Grenzt "Gesamt-Uptime" auf den Zeitraum ein, in dem das Projekt
    // tatsaechlich ueberwacht wurde: ein erst vor Kurzem hinzugefuegtes
    // Projekt hat innerhalb eines 30-Tage-Fensters ggf. nur wenige Stunden
    // echte check_results - die Zeit davor als "Uptime" zu zaehlen waere ein
    // erfundener Wert (keine Daten != online).
    pool.query<{ earliest: string | Date | null }>(
      `SELECT MIN(cr.checked_at) AS earliest
       FROM check_results cr JOIN checks c ON c.id = cr.check_id
       WHERE c.project_id = $1 AND c.enabled = true AND cr.checked_at >= $2 AND cr.checked_at < $3`,
      [projectId, from.toISOString(), to.toISOString()],
    ),
  ]);

  const outageRow = outageRows.rows[0];
  const earliestSample = firstSampleRows.rows[0]?.earliest;
  const monitoredFrom = earliestSample
    ? new Date(Math.max(from.getTime(), new Date(earliestSample).getTime()))
    : null;
  const windowMs = monitoredFrom ? to.getTime() - monitoredFrom.getTime() : 0;
  const downtimeMs = Math.min(windowMs, msOrNull(outageRow?.downtime_seconds ?? "0") ?? 0);

  return {
    projectId,
    windowHours: hours,
    from: from.toISOString(),
    to: to.toISOString(),
    availabilityPercent,
    // Keine im System hinterlegte SLA-Zielvorgabe (kein Vertrag/Konfigurationswert
    // vorhanden) - "SLA %" entspricht daher der gemessenen Verfuegbarkeit im
        // Zeitraum (erreichte SLA), keinem erfundenen Zielwert.
    slaPercent: availabilityPercent,
    totalUptimeMs: Math.max(0, windowMs - downtimeMs),
    totalDowntimeMs: downtimeMs,
    outageCount: Number(outageRow?.outage_count ?? 0),
    avgOutageDurationMs: msOrNull(outageRow?.avg_outage_seconds ?? null),
    longestOutageMs: msOrNull(outageRow?.longest_outage_seconds ?? null),
    shortestOutageMs: msOrNull(outageRow?.shortest_outage_seconds ?? null),
    mttrMs: durationStats.mttrMs,
    mtbfMs: durationStats.mtbfMs,
  };
}

// ---------------------------------------------------------------------------
// 4. Incident Analytics (GET /api/analytics/incidents)
// ---------------------------------------------------------------------------

const SEVERITY_VALUES: IncidentSeverity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export async function getIncidentAnalytics(options: { projectId?: string; projectIds?: string[]; severity?: string; hours?: number } = {}): Promise<IncidentAnalytics> {
  const hours = options.hours ?? 24 * 30;
  const to = new Date();
  const from = new Date(to.getTime() - hours * 60 * 60 * 1000);

  const conditions = ["created_at >= $1", "created_at < $2"];
  const values: unknown[] = [from.toISOString(), to.toISOString()];
  if (options.projectId) {
    values.push(options.projectId);
    conditions.push(`project_id = $${values.length}`);
  } else if (options.projectIds !== undefined) {
    values.push(options.projectIds);
    conditions.push(`project_id = ANY($${values.length})`);
  }
  // Phase 33 - additiver Severity-Filter.
  if (options.severity !== undefined) {
    values.push(options.severity);
    conditions.push(`severity = $${values.length}`);
  }
  const where = conditions.join(" AND ");

  // Phase 33 "Enterprise Reliability Intelligence & Incident Learning" -
  // "Top betroffene Projekte" bleibt fuer den bestehenden Einzelprojekt-Filter
  // (options.projectId) bewusst projektuebergreifend (unveraendertes Phase-19-
  // Verhalten, siehe Kommentar unten). Fuer den NEUEN organisationsweiten
  // Mehr-Projekt-Filter (options.projectIds) MUSS dieselbe Organisationsgrenze
  // gelten wie ueberall sonst - sonst waere dies ein Cross-Tenant-Datenleck
  // (Top-Projekte fremder Organisationen sichtbar).
  const topAffectedConditions = ["i.created_at >= $1", "i.created_at < $2"];
  const topAffectedValues: unknown[] = [from.toISOString(), to.toISOString()];
  if (options.projectIds !== undefined) {
    topAffectedValues.push(options.projectIds);
    topAffectedConditions.push(`i.project_id = ANY($${topAffectedValues.length})`);
  }

  const [heatmapRows, severityRows, topAffectedRows, topCauses, durationStats, mttdRows] = await Promise.all([
    pool.query<{ weekday: number; hour: number; count: string }>(
      `SELECT EXTRACT(DOW FROM created_at)::int AS weekday, EXTRACT(HOUR FROM created_at)::int AS hour, COUNT(*) AS count
       FROM incidents WHERE ${where} GROUP BY weekday, hour`,
      values,
    ),
    pool.query<{ severity: string; count: string }>(
      `SELECT severity, COUNT(*) AS count FROM incidents WHERE ${where} GROUP BY severity`,
      values,
    ),
    // "Top betroffene Projekte" ist bewusst immer projektuebergreifend (auch
    // wenn ein projectId-Filter aktiv ist) - eine auf ein einzelnes Projekt
    // begrenzte "Top-Projekte"-Liste waere trivial (immer nur 1 Eintrag).
    pool.query<{ key: string; label: string; count: string }>(
      `SELECT i.project_id AS key, p.name AS label, COUNT(*) AS count
       FROM incidents i JOIN projects p ON p.id = i.project_id
       WHERE ${topAffectedConditions.join(" AND ")}
       GROUP BY i.project_id, p.name ORDER BY count DESC LIMIT 10`,
      topAffectedValues,
    ),
    getTopFrequency("incident-causes", options.projectId ?? options.projectIds, from, to),
    getIncidentDurationStats({
      ...(options.projectId ? { projectId: options.projectId } : {}),
      ...(options.projectIds !== undefined ? { projectIds: options.projectIds } : {}),
      ...(options.severity !== undefined ? { severity: options.severity } : {}),
      from,
      to,
    }),
    // Mean Time To Detect: Zeit zwischen dem letzten erfolgreichen Check
    // desselben Checks vor dem Incident und dem Zeitpunkt, an dem der
    // Incident erfasst wurde (LATERAL nutzt den bestehenden Index
    // idx_check_results_check_id_status_checked_at).
    pool.query<{ avg_detect_seconds: string | null }>(
      // Phase 33 - der Statusarray-Platzhalter war zuvor auf "$3" hartkodiert
      // (galt nur, solange `values` immer genau 2 Eintraege hatte). Mit den
      // additiven projectIds/severity-Filtern kann `values` jetzt 2-4
      // Eintraege haben - beim Live-Test mit aktivem severity-Filter als
      // echter Bug aufgefallen ("bind message supplies 4 parameters, but
      // prepared statement requires 3"), hier auf einen dynamischen Index
      // korrigiert.
      `SELECT AVG(EXTRACT(EPOCH FROM (i.created_at - prev.checked_at))) AS avg_detect_seconds
       FROM incidents i
       JOIN LATERAL (
         SELECT checked_at FROM check_results cr
         WHERE cr.check_id = i.check_id AND cr.status = ANY($${values.length + 1}::text[]) AND cr.checked_at < i.created_at
         ORDER BY cr.checked_at DESC LIMIT 1
       ) prev ON true
       WHERE ${where}`,
      [...values, SUCCESSFUL_CHECK_STATUSES],
    ),
  ]);

  const heatmapMap = new Map(heatmapRows.rows.map((row) => [`${row.weekday}:${row.hour}`, Number(row.count)]));
  const heatmap: HeatmapCell[] = [];
  const byWeekdayCounts = new Array<number>(7).fill(0);
  for (let weekday = 0; weekday < 7; weekday++) {
    for (let hour = 0; hour < 24; hour++) {
      const count = heatmapMap.get(`${weekday}:${hour}`) ?? 0;
      heatmap.push({ weekday, hour, count });
      byWeekdayCounts[weekday] = (byWeekdayCounts[weekday] ?? 0) + count;
    }
  }
  const byWeekday: WeekdayEntry[] = byWeekdayCounts.map((count, weekday) => ({ weekday, count }));

  const severityDistribution = SEVERITY_VALUES.reduce(
    (acc, severity) => {
      acc[severity] = 0;
      return acc;
    },
    {} as Record<IncidentSeverity, number>,
  );
  for (const row of severityRows.rows) {
    severityDistribution[row.severity as IncidentSeverity] = Number(row.count);
  }

  const topAffectedProjects: FrequencyEntry[] = topAffectedRows.rows.map((row) => ({
    key: row.key,
    label: row.label,
    count: Number(row.count),
  }));

  return {
    windowHours: hours,
    heatmap,
    byWeekday,
    severityDistribution,
    topAffectedProjects,
    topCauses,
    durationStats,
    mttdMs: msOrNull(mttdRows.rows[0]?.avg_detect_seconds ?? null),
  };
}

// ---------------------------------------------------------------------------
// 5. Response-Time Analytics (GET /api/analytics/response-time)
// ---------------------------------------------------------------------------

const HISTOGRAM_BUCKET_COUNT = 20;

export async function getResponseTimeAnalytics(
  options: { projectId?: string; checkId?: string; range: AnalyticsRange; from?: string; to?: string },
): Promise<ResponseTimeAnalytics> {
  const { from, to, bucketMinutes } = resolveTimeWindow(options.range, options.from, options.to);

  const conditions = ["c.enabled = true", "cr.response_time_ms IS NOT NULL", "cr.checked_at >= $1", "cr.checked_at < $2"];
  const values: unknown[] = [from.toISOString(), to.toISOString()];
  if (options.projectId) {
    values.push(options.projectId);
    conditions.push(`c.project_id = $${values.length}`);
  }
  if (options.checkId) {
    values.push(options.checkId);
    conditions.push(`cr.check_id = $${values.length}`);
  }
  const where = conditions.join(" AND ");

  const { rows } = await pool.query<{
    count: string;
    avg_ms: string | null;
    min_ms: number | null;
    max_ms: number | null;
    stddev_ms: string | null;
    percentiles: number[] | null;
  }>(
    `SELECT
       COUNT(*) AS count,
       AVG(cr.response_time_ms) AS avg_ms,
       MIN(cr.response_time_ms) AS min_ms,
       MAX(cr.response_time_ms) AS max_ms,
       STDDEV(cr.response_time_ms) AS stddev_ms,
       PERCENTILE_CONT(ARRAY[0.5, 0.75, 0.9, 0.95, 0.99]) WITHIN GROUP (ORDER BY cr.response_time_ms) AS percentiles
     FROM check_results cr JOIN checks c ON c.id = cr.check_id
     WHERE ${where}`,
    values,
  );

  const row = rows[0];
  const count = Number(row?.count ?? 0);
  const percentiles = row?.percentiles ?? null;

  const stats: ResponseTimeStats = {
    count,
    avgMs: row?.avg_ms === null || row?.avg_ms === undefined ? null : Math.round(Number(row.avg_ms)),
    minMs: row?.min_ms ?? null,
    maxMs: row?.max_ms ?? null,
    medianMs: percentiles ? Math.round(Number(percentiles[0])) : null,
    p50Ms: percentiles ? Math.round(Number(percentiles[0])) : null,
    p75Ms: percentiles ? Math.round(Number(percentiles[1])) : null,
    p90Ms: percentiles ? Math.round(Number(percentiles[2])) : null,
    p95Ms: percentiles ? Math.round(Number(percentiles[3])) : null,
    p99Ms: percentiles ? Math.round(Number(percentiles[4])) : null,
    stddevMs: row?.stddev_ms === null || row?.stddev_ms === undefined ? null : Math.round(Number(row.stddev_ms)),
  };

  let histogram: ResponseTimeHistogramBucket[] = [];
  if (count > 0 && stats.minMs !== null && stats.maxMs !== null && stats.maxMs > stats.minMs) {
    const { rows: bucketRows } = await pool.query<{ bucket: number; count: string }>(
      `SELECT width_bucket(cr.response_time_ms, $${values.length + 1}, $${values.length + 2}, $${values.length + 3}) AS bucket,
              COUNT(*) AS count
       FROM check_results cr JOIN checks c ON c.id = cr.check_id
       WHERE ${where}
       GROUP BY bucket ORDER BY bucket`,
      [...values, stats.minMs, stats.maxMs + 1, HISTOGRAM_BUCKET_COUNT],
    );
    const span = stats.maxMs + 1 - stats.minMs;
    const bucketWidth = span / HISTOGRAM_BUCKET_COUNT;
    const countsByBucket = new Map(bucketRows.map((r) => [r.bucket, Number(r.count)]));
    histogram = Array.from({ length: HISTOGRAM_BUCKET_COUNT }, (_, index) => {
      const bucketIndex = index + 1;
      return {
        rangeStartMs: Math.round(stats.minMs! + index * bucketWidth),
        rangeEndMs: Math.round(stats.minMs! + (index + 1) * bucketWidth),
        count: countsByBucket.get(bucketIndex) ?? 0,
      };
    });
  } else if (count > 0 && stats.minMs !== null && stats.maxMs === stats.minMs) {
    histogram = [{ rangeStartMs: stats.minMs, rangeEndMs: stats.minMs, count }];
  }

  const responseBuckets = await queryResponseHistoryBuckets(
    { ...(options.projectId ? { projectId: options.projectId } : {}), ...(options.checkId ? { checkId: options.checkId } : {}) },
    from,
    to,
    bucketMinutes,
  );
  const timeline = buildBucketTimeline(from, to, bucketMinutes);
  const series = timeline.map((bucketStart) => toHistoryBucket(bucketStart, responseBuckets.get(bucketStart), 0));

  return { windowHours: (to.getTime() - from.getTime()) / (60 * 60 * 1000), stats, histogram, series };
}

// ---------------------------------------------------------------------------
// 6. Projektvergleich (GET /api/analytics/compare)
// ---------------------------------------------------------------------------

async function buildComparisonSide(
  projectId: string,
  hours: number,
  range: AnalyticsRange,
  from: Date,
  to: Date,
): Promise<ProjectComparisonSide> {
  const [health, availabilityPercent, avgResponseTimeMs, incidents, sla, history] = await Promise.all([
    getProjectHealth(projectId),
    getAvailabilityPercent(projectId, from, to),
    getAvgResponseTimeMs(projectId, from, to),
    getIncidentCounts(projectId, from, to),
    getProjectSla(projectId, hours),
    getProjectHistory(projectId, range, from.toISOString(), to.toISOString()),
  ]);

  return {
    projectId,
    projectName: health?.name ?? projectId,
    healthScore: health?.health.score ?? 0,
    availabilityPercent,
    avgResponseTimeMs,
    incidents,
    totalDowntimeMs: sla.totalDowntimeMs,
    mttrMs: sla.mttrMs,
    slaPercent: sla.slaPercent,
    history,
  };
}

export async function getProjectComparison(projectAId: string, projectBId: string, hours: number): Promise<ProjectComparison> {
  const to = new Date();
  const from = new Date(to.getTime() - hours * 60 * 60 * 1000);
  const range: AnalyticsRange = "custom";

  const [a, b] = await Promise.all([
    buildComparisonSide(projectAId, hours, range, from, to),
    buildComparisonSide(projectBId, hours, range, from, to),
  ]);

  return { windowHours: hours, a, b };
}

// ---------------------------------------------------------------------------
// 7./8. Drill Down mit Filtern (GET /api/analytics/drilldown)
// ---------------------------------------------------------------------------

function mapStatusToHealth(status: CheckStatus): "healthy" | "warning" | "critical" {
  if (status === "ONLINE") return "healthy";
  if (status === "WARNING") return "warning";
  return "critical";
}

export async function getDrillDown(
  filters: DrillDownFilters,
  page: number,
  pageSize: number,
): Promise<DrillDownResult> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filters.projectId) {
    values.push(filters.projectId);
    conditions.push(`c.project_id = $${values.length}`);
  }
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`cr.status = $${values.length}`);
  }
  if (filters.checkType) {
    values.push(filters.checkType);
    conditions.push(`c.type = $${values.length}`);
  }
  if (filters.from) {
    values.push(filters.from);
    conditions.push(`cr.checked_at >= $${values.length}`);
  }
  if (filters.to) {
    values.push(filters.to);
    conditions.push(`cr.checked_at < $${values.length}`);
  }
  if (filters.search) {
    values.push(`%${filters.search}%`);
    conditions.push(`(cr.check_id ILIKE $${values.length} OR c.type ILIKE $${values.length} OR p.name ILIKE $${values.length})`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  // severity filtert auf das per LATERAL ermittelte aktive Incident zum
  // Zeitpunkt des Check-Ergebnisses - muss daher nach dem JOIN (HAVING-artig
  // ueber eine Subquery) ausgewertet werden, da inc.severity keine Spalte
  // von check_results/checks ist.
  const severityCondition = filters.severity ? `WHERE incident_severity = $${values.length + 1}` : "";
  if (filters.severity) {
    values.push(filters.severity);
  }

  values.push(pageSize);
  const limitParam = `$${values.length}`;
  values.push(page * pageSize);
  const offsetParam = `$${values.length}`;

  const { rows } = await pool.query<{
    checked_at: string | Date;
    project_id: string;
    project_name: string;
    check_id: string;
    check_type: string;
    status: string;
    response_time_ms: number | null;
    incident_id: string | null;
    incident_severity: string | null;
  }>(
    `SELECT * FROM (
       SELECT
         cr.checked_at, c.project_id, p.name AS project_name, cr.check_id, c.type AS check_type,
         cr.status, cr.response_time_ms, inc.id AS incident_id, inc.severity AS incident_severity
       FROM check_results cr
       JOIN checks c ON c.id = cr.check_id
       JOIN projects p ON p.id = c.project_id
       LEFT JOIN LATERAL (
         SELECT id, severity FROM incidents i
         WHERE i.check_id = cr.check_id AND i.created_at <= cr.checked_at
           AND (i.resolved_at IS NULL OR i.resolved_at >= cr.checked_at)
         ORDER BY i.created_at DESC LIMIT 1
       ) inc ON true
       ${where}
     ) filtered
     ${severityCondition}
     ORDER BY checked_at DESC
     LIMIT ${limitParam} OFFSET ${offsetParam}`,
    values,
  );

  // total_count via separatem COUNT(*)-Query statt COUNT(*) OVER(), da der
  // Severity-Filter erst nach dem LATERAL-Join greift und sich damit nicht
  // sauber in dieselbe Fensterfunktion einbetten laesst.
  const countValues = values.slice(0, values.length - 2);
  const { rows: countRows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM (
       SELECT cr.checked_at, inc.severity AS incident_severity
       FROM check_results cr
       JOIN checks c ON c.id = cr.check_id
       JOIN projects p ON p.id = c.project_id
       LEFT JOIN LATERAL (
         SELECT id, severity FROM incidents i
         WHERE i.check_id = cr.check_id AND i.created_at <= cr.checked_at
           AND (i.resolved_at IS NULL OR i.resolved_at >= cr.checked_at)
         ORDER BY i.created_at DESC LIMIT 1
       ) inc ON true
       ${where}
     ) filtered
     ${severityCondition}`,
    countValues,
  );

  const total = Number(countRows[0]?.count ?? 0);
  const items: DrillDownRow[] = rows.map((row) => ({
    timestamp: toIsoString(row.checked_at),
    projectId: row.project_id,
    projectName: row.project_name,
    checkId: row.check_id,
    checkType: row.check_type,
    status: row.status as CheckStatus,
    responseTimeMs: row.response_time_ms,
    health: mapStatusToHealth(row.status as CheckStatus),
    incidentId: row.incident_id,
    incidentSeverity: row.incident_severity as IncidentSeverity | null,
  }));

  return {
    total,
    page,
    pageSize,
    hasNext: (page + 1) * pageSize < total,
    hasPrevious: page > 0,
    items,
  };
}
