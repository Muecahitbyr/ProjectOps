import { pool } from "./pool";
import type {
  ApiKeyUsageStat,
  ApiUsageAnalytics,
  ApiUsageFilter,
  ApiUsageGranularity,
  ApiUsageTimeseriesBucket,
  EndpointUsageStat,
  RecordApiUsageInput,
  StatusCodeBucket,
} from "../types/api-usage.types";

// Phase 16 Auftragspunkt 5 "API-Key Usage Tracking" - eine Zeile pro
// authentifiziertem /api/v1-Aufruf, der die Scope-/Rate-Limit-/Quota-
// Pruefung passiert hat (siehe middleware/api-key-auth.ts). Abgelehnte
// Versuche (fehlgeschlagene Authentifizierung, fehlender Scope, Rate-
// Limit/Quota ueberschritten) landen bewusst NICHT hier, sondern im
// bestehenden Audit-Log (core/audit-log.ts, Auftragspunkt 12) - andere
// Semantik ("abgelehnter Zugriffsversuch" vs. "verarbeiteter Request").
// Phase 19 Auftragspunkt 1 - erweitert um created_by_user_id/request_size_
// bytes/response_size_bytes (Migration 0038), unveraendert EIN Fire-and-
// Forget-Insert pro Request, keine zweite Tabelle.
export async function recordApiUsage(input: RecordApiUsageInput): Promise<void> {
  await pool.query(
    `INSERT INTO api_key_usage
       (api_key_id, organization_id, endpoint, method, status_code, duration_ms, mutation, idempotency_replay,
        created_by_user_id, request_size_bytes, response_size_bytes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      input.apiKeyId,
      input.organizationId,
      input.endpoint,
      input.method,
      input.statusCode,
      input.durationMs,
      input.mutation,
      input.idempotencyReplay,
      input.createdByUserId,
      input.requestSizeBytes,
      input.responseSizeBytes,
    ],
  );
}

// Phase 19 Auftragspunkt 1/2/6 "API Usage Analytics"/"Analytics Dashboard
// API"/"Security" - gemeinsamer WHERE-Baustein fuer alle Usage-Abfragen:
// organizationId ist die Tenant-Grenze, apiKeyId engt zusaetzlich auf einen
// einzelnen Key ein (GET .../keys/:id), teamId engt auf ein Team ein
// (team-gebundene API-Keys duerfen nur die Nutzung IHRES Teams sehen).
// `columnPrefix` erlaubt Wiederverwendung in Abfragen mit Tabellen-Alias
// (die Top-Keys-Abfrage joint api_keys/api_key_usage und braucht "u."/"k."
// statt unqualifizierter Spaltennamen).
function buildUsageFilterClause(
  filter: ApiUsageFilter,
  params: unknown[],
  columnPrefix: { organizationId: string; apiKeyId: string } = { organizationId: "organization_id", apiKeyId: "api_key_id" },
): string {
  const conditions: string[] = [];
  if (filter.organizationId) {
    params.push(filter.organizationId);
    conditions.push(`${columnPrefix.organizationId} = $${params.length}`);
  }
  if (filter.apiKeyId) {
    params.push(filter.apiKeyId);
    conditions.push(`${columnPrefix.apiKeyId} = $${params.length}`);
  }
  if (filter.teamId) {
    params.push(filter.teamId);
    conditions.push(`${columnPrefix.apiKeyId} IN (SELECT id FROM api_keys WHERE team_id = $${params.length})`);
  }
  return conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
}

// Auftragspunkt 14/15 "Rate Limits"/"Quotas" - Anzahl der schreibenden
// Requests der Organisation heute (mutation = true), fuer eine potenzielle
// zukuenftige write-spezifische Tages-Quota. Zaehlt bewusst KEINE
// Idempotency-Replays als zweiten Write (siehe Migration 0036-Kommentar).
export async function countOrganizationMutationsToday(organizationId: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM api_key_usage
     WHERE organization_id = $1 AND mutation = true AND idempotency_replay = false AND created_at >= date_trunc('day', now())`,
    [organizationId],
  );
  return Number(rows[0]?.count ?? 0);
}

// Auftragspunkt 15 "Quotas" - dedizierte Tages-Quota fuer die
// sicherheitskritischste Kategorie (Automation-Ausfuehrungen), zusaetzlich
// zur allgemeinen Tages-Quota (countOrganizationRequestsToday). Erkennt
// echte Ausfuehrungen am Endpunkt-Suffix "/execute" UND mutation = true
// (ein blockierter/idempotenter Replay-Versuch zaehlt nicht doppelt).
export async function countOrganizationAutomationExecutionsToday(organizationId: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM api_key_usage
     WHERE organization_id = $1 AND mutation = true AND idempotency_replay = false
       AND endpoint LIKE '%/execute' AND created_at >= date_trunc('day', now())`,
    [organizationId],
  );
  return Number(rows[0]?.count ?? 0);
}

// Auftragspunkt 7/9 "API Quotas"/"Quota Headers" - die Tages-Quota gilt PRO
// ORGANISATION (nicht pro einzelnem Key), damit sie nicht durch das
// Anlegen mehrerer API-Keys derselben Organisation umgangen werden kann
// (siehe Testfall "kein Bypass ueber mehrere API-Keys derselben
// Organisation", Auftragspunkt 20). Der per-Minute-Rate-Limiter
// (middleware/api-key-auth.ts) bleibt dagegen bewusst PRO Key - das ist ein
// anderer, missbrauchsbezogener Mechanismus (Auftragspunkt 8: "API-Key-
// basierte Limits" vs. "Plan-Limit" sind zwei separate Punkte).
export async function countOrganizationRequestsToday(organizationId: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM api_key_usage WHERE organization_id = $1 AND created_at >= date_trunc('day', now())`,
    [organizationId],
  );
  return Number(rows[0]?.count ?? 0);
}

// Auftragspunkt 6 "Usage Analytics" - organisationsweit (fuer Platform
// Administration -> Usage-Tab/API-Analytics-Seite und die Dashboard/
// Plattform-Overview-Widgets), zusaetzlich (Phase 19) auf ein Team oder
// einen einzelnen API-Key eingrenzbar. Ohne Filter global (Platform-Owner-
// Ansicht). Bewusst EIN Filterobjekt statt mehrerer optionaler Parameter,
// damit neue Einschraenkungen (hier: teamId/apiKeyId) additiv bleiben und
// bestehende Aufrufstellen (platform.routes.ts, routes/v1/usage.routes.ts)
// nur ihr eigenes Feld setzen muessen.
export async function getApiUsageAnalytics(filter: ApiUsageFilter = {}): Promise<ApiUsageAnalytics> {
  // Ein Parameterarray, EINMAL befuellt - alle acht direkt auf api_key_usage
  // laufenden Abfragen teilen sich dieselben Platzhalter/Werte (die
  // Tages-/24h-/7d-Faelle haengen nur eine zusaetzliche, parameterlose
  // created_at-Bedingung an dasselbe WHERE an). Nur die Top-Keys-Abfrage
  // (JOIN mit api_keys) braucht eigene Spalten-Praefixe, bekommt aber
  // dieselben Filterwerte in derselben Reihenfolge - ein zweiter Aufruf mit
  // frischem Parameterarray haelt die Platzhalternummerierung dafuer korrekt.
  const params: unknown[] = [];
  const where = buildUsageFilterClause(filter, params);
  const andClause = where ? where.replace("WHERE", "AND") : "";

  const topKeysParams: unknown[] = [];
  const whereTopKeys = buildUsageFilterClause(filter, topKeysParams, { organizationId: "k.organization_id", apiKeyId: "u.api_key_id" });

  // Kein separates COUNT(*) fuer "requestsTotal" - die total/errors-Abfrage
  // unten liefert beides in einem Durchlauf (COUNT(*) UND COUNT(*) FILTER),
  // eine zusaetzliche Abfrage nur fuer total waere redundant.
  const [todayResult, last24hResult, last7dResult, errorResult, avgDurationResult, statusResult, topKeysResult, topEndpointsResult] =
    await Promise.all([
      pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM api_key_usage WHERE created_at >= date_trunc('day', now()) ${andClause}`,
        params,
      ),
      pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM api_key_usage WHERE created_at >= now() - interval '24 hours' ${andClause}`,
        params,
      ),
      pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM api_key_usage WHERE created_at >= now() - interval '7 days' ${andClause}`,
        params,
      ),
      pool.query<{ total: string; errors: string }>(
        `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status_code >= 400) AS errors FROM api_key_usage ${where}`,
        params,
      ),
      pool.query<{ avg_duration: string | null }>(`SELECT AVG(duration_ms) AS avg_duration FROM api_key_usage ${where}`, params),
      pool.query<{ status_code: number; count: string }>(
        `SELECT status_code, COUNT(*) AS count FROM api_key_usage ${where} GROUP BY status_code ORDER BY status_code`,
        params,
      ),
      pool.query<{ api_key_id: string; description: string; request_count: string; error_count: string; last_used_at: string | Date | null }>(
        `SELECT k.id AS api_key_id, k.description, COUNT(u.*) AS request_count,
                COUNT(u.*) FILTER (WHERE u.status_code >= 400) AS error_count, k.last_used_at
         FROM api_keys k
         JOIN api_key_usage u ON u.api_key_id = k.id
         ${whereTopKeys}
         GROUP BY k.id, k.description, k.last_used_at
         ORDER BY request_count DESC
         LIMIT 10`,
        topKeysParams,
      ),
      pool.query<{ endpoint: string; method: string; request_count: string; error_count: string; avg_duration: string | null }>(
        `SELECT endpoint, method, COUNT(*) AS request_count, COUNT(*) FILTER (WHERE status_code >= 400) AS error_count, AVG(duration_ms) AS avg_duration
         FROM api_key_usage ${where}
         GROUP BY endpoint, method
         ORDER BY request_count DESC
         LIMIT 10`,
        params,
      ),
    ]);

  const total = Number(errorResult.rows[0]?.total ?? 0);
  const errors = Number(errorResult.rows[0]?.errors ?? 0);

  const statusCodeDistribution: StatusCodeBucket[] = statusResult.rows.map((row) => ({
    statusCode: row.status_code,
    count: Number(row.count),
  }));

  const topApiKeys: ApiKeyUsageStat[] = topKeysResult.rows.map((row) => ({
    apiKeyId: row.api_key_id,
    description: row.description,
    requestCount: Number(row.request_count),
    errorCount: Number(row.error_count),
    lastUsedAt: row.last_used_at === null ? null : row.last_used_at instanceof Date ? row.last_used_at.toISOString() : row.last_used_at,
  }));

  const topEndpoints: EndpointUsageStat[] = topEndpointsResult.rows.map((row) => ({
    endpoint: row.endpoint,
    method: row.method,
    requestCount: Number(row.request_count),
    errorCount: Number(row.error_count),
    averageDurationMs: row.avg_duration === null ? null : Math.round(Number(row.avg_duration)),
  }));

  return {
    generatedAt: new Date().toISOString(),
    requestsTotal: total,
    requestsToday: Number(todayResult.rows[0]?.count ?? 0),
    requestsLast24h: Number(last24hResult.rows[0]?.count ?? 0),
    requestsLast7d: Number(last7dResult.rows[0]?.count ?? 0),
    errorRatePercent: total === 0 ? 0 : Math.round((errors / total) * 1000) / 10,
    averageResponseTimeMs: avgDurationResult.rows[0]?.avg_duration === null ? null : Math.round(Number(avgDurationResult.rows[0]?.avg_duration)),
    statusCodeDistribution,
    topApiKeys,
    topEndpoints,
  };
}

// Phase 19 Auftragspunkt 2 "Analytics Dashboard API" (GET .../timeseries) -
// eine Zeile pro Zeit-Bucket, LUECKENLOS (generate_series links gejoint),
// damit ein Chart im Frontend keine falsch interpolierten Sprnge ueber
// stille Perioden zeigt, sondern echte Nullen. granularity ist entweder
// 'hour' (Default, fuer Zeitraeume bis zu einigen Tagen) oder 'day' (fuer
// laengere Zeitraeume) - date_trunc() uebernimmt das Bucketing direkt in
// SQL statt im Anwendungscode nachzugruppieren.
export async function getApiUsageTimeseries(
  filter: ApiUsageFilter,
  hours: number,
  granularity: ApiUsageGranularity,
): Promise<ApiUsageTimeseriesBucket[]> {
  // granularity fliesst unten per Template-String direkt in SQL ein
  // (date_trunc()/Interval-Einheiten koennen nicht als Query-Parameter
  // gebunden werden) - eine strikte Laufzeit-Whitelist hier ist die letzte
  // Verteidigungslinie, unabhaengig davon, ob der Aufrufer den TS-Typ
  // korrekt eingehalten hat.
  if (granularity !== "hour" && granularity !== "day") {
    throw new Error(`Ungueltige Granularitaet: ${String(granularity)}`);
  }

  const params: unknown[] = [hours];
  const whereUsage = buildUsageFilterClause(filter, params, { organizationId: "u.organization_id", apiKeyId: "u.api_key_id" });
  const usageJoinCondition = whereUsage ? whereUsage.replace("WHERE", "AND") : "";

  const { rows } = await pool.query<{ bucket: string | Date; requests: string; errors: string; avg_latency: string | null }>(
    `WITH buckets AS (
       SELECT generate_series(
         date_trunc('${granularity}', now() - ($1 || ' hours')::interval),
         date_trunc('${granularity}', now()),
         ('1 ${granularity}')::interval
       ) AS bucket
     )
     SELECT b.bucket,
            COUNT(u.*) AS requests,
            COUNT(u.*) FILTER (WHERE u.status_code >= 400) AS errors,
            AVG(u.duration_ms) AS avg_latency
     FROM buckets b
     LEFT JOIN api_key_usage u
       ON date_trunc('${granularity}', u.created_at) = b.bucket
       ${usageJoinCondition}
     GROUP BY b.bucket
     ORDER BY b.bucket ASC`,
    params,
  );

  return rows.map((row) => ({
    timestamp: row.bucket instanceof Date ? row.bucket.toISOString() : row.bucket,
    requests: Number(row.requests),
    errors: Number(row.errors),
    avgLatency: row.avg_latency === null ? null : Math.round(Number(row.avg_latency)),
  }));
}

// Phase 19 Auftragspunkt 5 "Realtime" (API_USAGE_THRESHOLD_WARNING/
// API_USAGE_SPIKE_DETECTED) - EIN gebuendelter, nach organization_id
// gruppierter Abfragesatz fuer ALLE Organisationen auf einmal (statt einer
// Abfrage pro Organisation), damit der periodische Hintergrund-Check
// (core/api-usage-intelligence.ts) bei vielen Organisationen nicht linear
// mit deren Anzahl skaliert. baselinePer5Min schliesst die letzten 5
// Minuten bewusst aus (sonst wuerde ein echter Spike seine eigene
// Baseline anheben und sich selbst maskieren).
export interface OrganizationUsageSignal {
  organizationId: string;
  recentRequests5m: number;
  recentTotal15m: number;
  recentErrors15m: number;
  baselinePer5Min: number;
}

export async function getOrganizationUsageSignals(): Promise<OrganizationUsageSignal[]> {
  const [recentResult, errorResult, baselineResult] = await Promise.all([
    pool.query<{ organization_id: string; count: string }>(
      `SELECT organization_id, COUNT(*) AS count FROM api_key_usage
       WHERE created_at >= now() - interval '5 minutes' GROUP BY organization_id`,
    ),
    pool.query<{ organization_id: string; total: string; errors: string }>(
      `SELECT organization_id, COUNT(*) AS total, COUNT(*) FILTER (WHERE status_code >= 400) AS errors FROM api_key_usage
       WHERE created_at >= now() - interval '15 minutes' GROUP BY organization_id`,
    ),
    pool.query<{ organization_id: string; count: string }>(
      `SELECT organization_id, COUNT(*) AS count FROM api_key_usage
       WHERE created_at >= now() - interval '65 minutes' AND created_at < now() - interval '5 minutes'
       GROUP BY organization_id`,
    ),
  ]);

  const recentByOrg = new Map(recentResult.rows.map((row) => [row.organization_id, Number(row.count)]));
  const baselineByOrg = new Map(baselineResult.rows.map((row) => [row.organization_id, Number(row.count) / 12]));

  return errorResult.rows.map((row) => ({
    organizationId: row.organization_id,
    recentRequests5m: recentByOrg.get(row.organization_id) ?? 0,
    recentTotal15m: Number(row.total),
    recentErrors15m: Number(row.errors),
    baselinePer5Min: baselineByOrg.get(row.organization_id) ?? 0,
  }));
}
