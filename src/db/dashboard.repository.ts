import { pool } from "./pool";
import { getRecentIncidentsForProject } from "./incidents.repository";
import { healthScoreConfig, SUCCESSFUL_CHECK_STATUSES } from "../config/health.config";
import { HealthStatus } from "../types/health.types";
import { DashboardEventType, type DashboardEventTypeWire } from "../types/dashboard-event.types";
import { FALLBACK_ANALYSIS } from "../ai/incident-analyzer";
import type { CheckStatus } from "../types/check-result.types";
import type { Incident, IncidentSeverity } from "../types/incident.types";

const DEFAULT_TIMELINE_HOURS = 24;
const DEFAULT_TIMELINE_LIMIT = 500;
const DEFAULT_TIMELINE_OFFSET = 0;
const DEFAULT_EVENTS_LIMIT = 50;
const DEFAULT_RECENT_INCIDENTS_LIMIT = 10;
const AVAILABILITY_WINDOW_24H_HOURS = 24;
const AVAILABILITY_WINDOW_7D_HOURS = 24 * 7;
const AVAILABILITY_DECIMAL_PLACES = 2;
const DASHBOARD_SUMMARY_CACHE_TTL_MS = 30_000;

// ---------------------------------------------------------------------------
// Kleine Helfer, an mehreren Stellen dieser Datei gebraucht.
// ---------------------------------------------------------------------------

// pg liefert TIMESTAMPTZ-Spalten je nach Treiberkonfiguration als Date oder
// als String - an jeder Mapping-Stelle einzeln zu unterscheiden war bisher
// dupliziert.
function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toIsoStringOrNull(value: string | Date | null): string | null {
  return value === null ? null : toIsoString(value);
}

export interface ChecksSummary {
  total: number;
  online: number;
  warning: number;
  error: number;
}

export interface HealthResult {
  status: HealthStatus;
  score: number;
}

interface CheckStatusRow {
  check_id: string;
  project_id: string;
  type: string;
  target: string | null;
  status: string | null;
  response_time_ms: number | null;
  checked_at: string | Date | null;
}

// "Critical" aus der Health-Score-Formel entspricht OFFLINE (Ziel komplett
// nicht erreichbar) - der schwerste unserer vier CheckStatus-Werte. Die
// Gewichtung selbst kommt ausschliesslich aus health.config.ts.
const CHECK_STATUS_PENALTY: Partial<Record<CheckStatus, number>> = {
  WARNING: healthScoreConfig.warningPenalty,
  ERROR: healthScoreConfig.errorPenalty,
  OFFLINE: healthScoreConfig.offlinePenalty,
};

// Nur aktivierte Checks fliessen in Health-Score und Zusammenfassungen ein -
// deaktivierte Checks werden nicht aktiv ueberwacht und sollen den Status
// nicht verfaelschen.
async function getEnabledCheckStatusRows(projectId?: string): Promise<CheckStatusRow[]> {
  const conditions = ["c.enabled = true"];
  const values: unknown[] = [];

  if (projectId) {
    values.push(projectId);
    conditions.push(`c.project_id = $${values.length}`);
  }

  const { rows } = await pool.query<CheckStatusRow>(
    `SELECT
       c.id AS check_id,
       c.project_id,
       c.type,
       c.target,
       lr.status,
       lr.response_time_ms,
       lr.checked_at
     FROM checks c
     LEFT JOIN LATERAL (
       SELECT status, response_time_ms, checked_at
       FROM check_results cr
       WHERE cr.check_id = c.id
       ORDER BY cr.checked_at DESC
       LIMIT 1
     ) lr ON true
     WHERE ${conditions.join(" AND ")}
     ORDER BY c.project_id, c.id`,
    values,
  );
  return rows;
}

function computeHealth(statuses: Array<CheckStatus | null>): HealthResult {
  let score: number = healthScoreConfig.maxScore;
  let hasCritical = false;
  let hasWarning = false;

  for (const status of statuses) {
    if (!status || status === "ONLINE") {
      continue;
    }
    score -= CHECK_STATUS_PENALTY[status] ?? 0;
    if (status === "ERROR" || status === "OFFLINE") {
      hasCritical = true;
    } else if (status === "WARNING") {
      hasWarning = true;
    }
  }

  return {
    status: hasCritical ? HealthStatus.CRITICAL : hasWarning ? HealthStatus.WARNING : HealthStatus.HEALTHY,
    score: Math.max(healthScoreConfig.minScore, score),
  };
}

function summarizeChecks(statuses: Array<CheckStatus | null>): ChecksSummary {
  let online = 0;
  let warning = 0;
  let error = 0;

  for (const status of statuses) {
    if (status === "ONLINE") online++;
    else if (status === "WARNING") warning++;
    else if (status === "ERROR" || status === "OFFLINE") error++;
  }

  return { total: statuses.length, online, warning, error };
}

function groupStatusesByProject(rows: CheckStatusRow[]): Map<string, Array<CheckStatus | null>> {
  const byProject = new Map<string, Array<CheckStatus | null>>();
  for (const row of rows) {
    const list = byProject.get(row.project_id) ?? [];
    list.push(row.status as CheckStatus | null);
    byProject.set(row.project_id, list);
  }
  return byProject;
}

// ---------------------------------------------------------------------------
// Projekt-Uebersicht (GET /api/dashboard/projects)
//
// Dies ist die einzige Stelle, die checks + check_results fuer eine
// projektweite Health-Bewertung abfragt. getDashboardSummary() aggregiert
// aus dem Ergebnis dieser Funktion weiter, statt dieselben Daten erneut aus
// der DB zu laden - vermeidet doppelte Berechnung und ist die natuerliche
// Stelle, um spaeter einen Cache (TTL/Redis) vorzuschalten, da die Funktion
// keine HTTP-Abhaengigkeiten hat und ein stabiles, serialisierbares Ergebnis
// liefert.
// ---------------------------------------------------------------------------
export interface ProjectHealthSummary {
  id: string;
  name: string;
  type: string;
  health: HealthResult;
  checks: ChecksSummary;
  openIncidents: number;
}

// Phase 16 Auftragspunkt 4 "Tenant Isolation" - optionaler
// organizationId-Filter, additiv (bestehende interne Aufrufer ohne
// Argument sind unveraendert org-uebergreifend, z.B. das interne
// Dashboard). /api/v1/projects (routes/v1/projects.routes.ts) nutzt den
// Filter, um niemals Projekte einer fremden Organisation zurueckzugeben.
export async function getAllProjectsHealth(organizationId?: string): Promise<ProjectHealthSummary[]> {
  const values: unknown[] = [];
  const where = organizationId ? (values.push(organizationId), `WHERE organization_id = $1`) : "";
  const { rows: projectRows } = await pool.query<{ id: string; name: string; type: string }>(
    `SELECT id, name, type FROM projects ${where} ORDER BY name`,
    values,
  );

  const checkRows = await getEnabledCheckStatusRows();
  const byProject = groupStatusesByProject(checkRows);

  const { rows: incidentRows } = await pool.query<{ project_id: string; count: string }>(
    `SELECT project_id, COUNT(*) AS count FROM incidents WHERE resolved = false GROUP BY project_id`,
  );
  const openIncidentsByProject = new Map(incidentRows.map((row) => [row.project_id, Number(row.count)]));

  return projectRows.map((project) => {
    const statuses = byProject.get(project.id) ?? [];
    return {
      id: project.id,
      name: project.name,
      type: project.type,
      health: computeHealth(statuses),
      checks: summarizeChecks(statuses),
      openIncidents: openIncidentsByProject.get(project.id) ?? 0,
    };
  });
}

// Leichtgewichtige Variante von getAllProjectsHealth() fuer genau ein
// Projekt - fuer den PROJECT_UPDATED-Realtime-Event (siehe
// realtime/websocket.server.ts), der nach jedem Scheduler-Durchlauf pro
// Projekt gesendet wird und keine Batch-Abfrage ueber alle Projekte
// braucht.
export async function getProjectHealth(projectId: string): Promise<ProjectHealthSummary | undefined> {
  const { rows: projectRows } = await pool.query<{ id: string; name: string; type: string }>(
    `SELECT id, name, type FROM projects WHERE id = $1`,
    [projectId],
  );
  const project = projectRows[0];
  if (!project) {
    return undefined;
  }

  const checkRows = await getEnabledCheckStatusRows(projectId);
  const statuses = checkRows.map((row) => row.status as CheckStatus | null);

  const { rows: incidentRows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM incidents WHERE project_id = $1 AND resolved = false`,
    [projectId],
  );

  return {
    id: project.id,
    name: project.name,
    type: project.type,
    health: computeHealth(statuses),
    checks: summarizeChecks(statuses),
    openIncidents: Number(incidentRows[0]?.count ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Gesamt-Zusammenfassung (GET /api/dashboard)
// ---------------------------------------------------------------------------
export interface DashboardSummary {
  status: HealthStatus;
  generatedAt: string;
  // Vorbereitung fuer zukuenftiges Caching (noch kein Redis/Materialized
  // View): signalisiert dem Client, bis wann dieser Snapshot als aktuell
  // gelten kann.
  cachedUntil: string;
  summary: {
    projects: { total: number; healthy: number; warning: number; critical: number };
    checks: ChecksSummary;
    incidents: { open: number; critical: number };
    // Fuer die City-Visualisierung (AI Center / Notification Center) - siehe
    // Phase 5. "failed"/"fallback" sind aus den bereits bestehenden Tabellen
    // notifications/ai_analysis gezaehlt, keine neue Datenquelle.
    notifications: { total: number; failed: number };
    aiAnalyses: { total: number; fallback: number };
  };
}

// Nur die CRITICAL-Teilmenge wird separat abgefragt - die Gesamtzahl
// offener Incidents ergibt sich bereits kostenlos aus der Summe von
// ProjectHealthSummary.openIncidents (siehe getDashboardSummary), ein
// zweiter Zaehl-Query dafuer waere redundant.
async function getCriticalOpenIncidentCount(): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM incidents WHERE resolved = false AND severity = 'CRITICAL'`,
  );
  return Number(rows[0]?.count ?? 0);
}

async function getNotificationStats(): Promise<{ total: number; failed: number }> {
  const { rows } = await pool.query<{ total: string; failed: string }>(
    `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status = 'FAILED') AS failed FROM notifications`,
  );
  const row = rows[0];
  return { total: Number(row?.total ?? 0), failed: Number(row?.failed ?? 0) };
}

// "fallback" zaehlt Analysen, die nicht von Claude stammen, sondern der
// FALLBACK_ANALYSIS-Platzhalter sind (z.B. weil kein ANTHROPIC_API_KEY
// gesetzt ist oder der Aufruf fehlschlug) - ein echtes Signal fuer den
// Zustand der KI-Anbindung, kein erfundener Wert.
async function getAiAnalysisStats(): Promise<{ total: number; fallback: number }> {
  const { rows } = await pool.query<{ total: string; fallback: string }>(
    `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE summary = $1) AS fallback FROM ai_analysis`,
    [FALLBACK_ANALYSIS.summary],
  );
  const row = rows[0];
  return { total: Number(row?.total ?? 0), fallback: Number(row?.fallback ?? 0) };
}

// Phase 11 Teil 2 "Self Healing" (CLEAR_CACHE): cachedUntil war bisher nur
// ein Hinweis fuer den Client, ohne echten Server-Cache dahinter - jetzt
// wird getDashboardSummary() innerhalb der TTL tatsaechlich aus dem
// Speicher bedient. clearDashboardCache() (automation/safe-action-runner.ts)
// hat damit einen echten Effekt statt nichts zu tun.
let cachedSummary: { value: DashboardSummary; expiresAt: number } | undefined;

export function clearDashboardCache(): void {
  cachedSummary = undefined;
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  if (cachedSummary && cachedSummary.expiresAt > Date.now()) {
    return cachedSummary.value;
  }

  const projectsHealth = await getAllProjectsHealth();

  const projectSummary = { total: 0, healthy: 0, warning: 0, critical: 0 };
  const checksSummary: ChecksSummary = { total: 0, online: 0, warning: 0, error: 0 };
  let openIncidents = 0;

  for (const project of projectsHealth) {
    projectSummary.total++;
    projectSummary[project.health.status]++;
    checksSummary.total += project.checks.total;
    checksSummary.online += project.checks.online;
    checksSummary.warning += project.checks.warning;
    checksSummary.error += project.checks.error;
    openIncidents += project.openIncidents;
  }

  const [criticalIncidents, notifications, aiAnalyses] = await Promise.all([
    getCriticalOpenIncidentCount(),
    getNotificationStats(),
    getAiAnalysisStats(),
  ]);

  const overallStatus: HealthStatus =
    projectSummary.critical > 0
      ? HealthStatus.CRITICAL
      : projectSummary.warning > 0
        ? HealthStatus.WARNING
        : HealthStatus.HEALTHY;

  const generatedAt = new Date();

  const result: DashboardSummary = {
    status: overallStatus,
    generatedAt: generatedAt.toISOString(),
    cachedUntil: new Date(generatedAt.getTime() + DASHBOARD_SUMMARY_CACHE_TTL_MS).toISOString(),
    summary: {
      projects: projectSummary,
      checks: checksSummary,
      incidents: { open: openIncidents, critical: criticalIncidents },
      notifications,
      aiAnalyses,
    },
  };

  cachedSummary = { value: result, expiresAt: generatedAt.getTime() + DASHBOARD_SUMMARY_CACHE_TTL_MS };
  return result;
}

// ---------------------------------------------------------------------------
// Projekt-Detail (GET /api/dashboard/projects/:id)
// ---------------------------------------------------------------------------
export interface ProjectCheckDetail {
  id: string;
  type: string;
  status: CheckStatus | null;
  lastRun: string | null;
  responseTimeMs: number | null;
}

export interface ProjectAvailabilityStats {
  lastSuccessfulCheck: string | null;
  lastFailedCheck: string | null;
  averageResponseTimeMs: number | null;
  fastestResponseTimeMs: number | null;
  slowestResponseTimeMs: number | null;
  p95ResponseTimeMs: number | null;
  availability24h: number;
  availability7d: number;
}

export interface ProjectDashboardDetail extends ProjectAvailabilityStats {
  project: { id: string; name: string; description: string | null };
  health: HealthResult;
  checks: ProjectCheckDetail[];
  recentIncidents: Incident[];
}

function calculateAvailability(successCount: number, totalCount: number): number {
  if (totalCount === 0) {
    return healthScoreConfig.maxScore;
  }
  return Number(((successCount / totalCount) * 100).toFixed(AVAILABILITY_DECIMAL_PLACES));
}

// Verfuegbarkeit: ONLINE/WARNING = erfolgreich, ERROR/OFFLINE = Fehler (siehe
// health.config.ts). Eine einzige Abfrage berechnet Letzterfolg/-fehler,
// Antwortzeit-Statistiken (inkl. p95) und beide Verfuegbarkeitsfenster
// (24h/7d) gemeinsam, um nicht mehrfach gegen check_results zu scannen.
async function getProjectAvailabilityStats(projectId: string): Promise<ProjectAvailabilityStats> {
  const { rows } = await pool.query<{
    last_successful_at: string | Date | null;
    last_failed_at: string | Date | null;
    avg_response_time_ms: string | null;
    min_response_time_ms: number | null;
    max_response_time_ms: number | null;
    p95_response_time_ms: string | null;
    total_24h: string;
    success_24h: string;
    total_7d: string;
    success_7d: string;
  }>(
    `SELECT
       MAX(cr.checked_at) FILTER (WHERE cr.status = ANY($2::text[])) AS last_successful_at,
       MAX(cr.checked_at) FILTER (WHERE cr.status != ALL($2::text[])) AS last_failed_at,
       AVG(cr.response_time_ms) AS avg_response_time_ms,
       MIN(cr.response_time_ms) AS min_response_time_ms,
       MAX(cr.response_time_ms) AS max_response_time_ms,
       PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY cr.response_time_ms) AS p95_response_time_ms,
       COUNT(*) FILTER (WHERE cr.checked_at >= now() - ($3 || ' hours')::interval) AS total_24h,
       COUNT(*) FILTER (WHERE cr.checked_at >= now() - ($3 || ' hours')::interval AND cr.status = ANY($2::text[])) AS success_24h,
       COUNT(*) FILTER (WHERE cr.checked_at >= now() - ($4 || ' hours')::interval) AS total_7d,
       COUNT(*) FILTER (WHERE cr.checked_at >= now() - ($4 || ' hours')::interval AND cr.status = ANY($2::text[])) AS success_7d
     FROM check_results cr
     JOIN checks c ON c.id = cr.check_id
     WHERE cr.project_id = $1 AND c.enabled = true`,
    [projectId, SUCCESSFUL_CHECK_STATUSES, AVAILABILITY_WINDOW_24H_HOURS, AVAILABILITY_WINDOW_7D_HOURS],
  );

  const row = rows[0];
  const avg = row?.avg_response_time_ms;
  const p95 = row?.p95_response_time_ms;

  return {
    lastSuccessfulCheck: toIsoStringOrNull(row?.last_successful_at ?? null),
    lastFailedCheck: toIsoStringOrNull(row?.last_failed_at ?? null),
    averageResponseTimeMs: avg ? Math.round(Number(avg)) : null,
    fastestResponseTimeMs: row?.min_response_time_ms ?? null,
    slowestResponseTimeMs: row?.max_response_time_ms ?? null,
    p95ResponseTimeMs: p95 ? Math.round(Number(p95)) : null,
    availability24h: calculateAvailability(Number(row?.success_24h ?? 0), Number(row?.total_24h ?? 0)),
    availability7d: calculateAvailability(Number(row?.success_7d ?? 0), Number(row?.total_7d ?? 0)),
  };
}

export async function getProjectDashboardDetail(projectId: string): Promise<ProjectDashboardDetail | undefined> {
  const { rows: projectRows } = await pool.query<{ id: string; name: string; description: string | null }>(
    `SELECT id, name, description FROM projects WHERE id = $1`,
    [projectId],
  );
  const project = projectRows[0];
  if (!project) {
    return undefined;
  }

  const checkRows = await getEnabledCheckStatusRows(projectId);

  // Ein einzelner Durchlauf statt zwei getrennter .map()-Aufrufe ueber
  // dieselben Zeilen - statuses wird nur fuer computeHealth() gebraucht.
  const statuses: Array<CheckStatus | null> = [];
  const checks: ProjectCheckDetail[] = [];
  for (const row of checkRows) {
    const status = row.status as CheckStatus | null;
    statuses.push(status);
    checks.push({
      id: row.check_id,
      type: row.type,
      status,
      lastRun: toIsoStringOrNull(row.checked_at),
      responseTimeMs: row.response_time_ms,
    });
  }

  const [recentIncidents, stats] = await Promise.all([
    getRecentIncidentsForProject(projectId, DEFAULT_RECENT_INCIDENTS_LIMIT),
    getProjectAvailabilityStats(projectId),
  ]);

  return {
    project,
    health: computeHealth(statuses),
    checks,
    recentIncidents,
    ...stats,
  };
}

// ---------------------------------------------------------------------------
// Timeline (GET /api/dashboard/timeline) - paginiert fuer Charts
// ---------------------------------------------------------------------------
export interface TimelinePoint {
  timestamp: string;
  checkId: string;
  status: CheckStatus;
  responseTimeMs: number | null;
}

export interface TimelineResult {
  total: number;
  limit: number;
  offset: number;
  hasNext: boolean;
  hasPrevious: boolean;
  items: TimelinePoint[];
}

export async function getTimeline(
  options: { projectId?: string; hours?: number; limit?: number; offset?: number } = {},
): Promise<TimelineResult> {
  const hours = options.hours ?? DEFAULT_TIMELINE_HOURS;
  const limit = options.limit ?? DEFAULT_TIMELINE_LIMIT;
  const offset = options.offset ?? DEFAULT_TIMELINE_OFFSET;

  const conditions = [`checked_at >= now() - ($1 || ' hours')::interval`];
  const values: unknown[] = [hours];

  if (options.projectId) {
    values.push(options.projectId);
    conditions.push(`project_id = $${values.length}`);
  }

  values.push(limit);
  const limitPlaceholder = `$${values.length}`;
  values.push(offset);
  const offsetPlaceholder = `$${values.length}`;

  // COUNT(*) OVER() liefert die Gesamtanzahl (fuer Pagination) in derselben
  // Abfrage mit - kein zweiter Roundtrip zur DB fuer die "total"-Zahl.
  const { rows } = await pool.query<{
    check_id: string;
    status: string;
    response_time_ms: number | null;
    checked_at: string | Date;
    total_count: string;
  }>(
    `SELECT check_id, status, response_time_ms, checked_at, COUNT(*) OVER() AS total_count
     FROM check_results
     WHERE ${conditions.join(" AND ")}
     ORDER BY checked_at ASC
     LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
    values,
  );

  const items: TimelinePoint[] = rows.map((row) => ({
    timestamp: toIsoString(row.checked_at),
    checkId: row.check_id,
    status: row.status as CheckStatus,
    responseTimeMs: row.response_time_ms,
  }));

  const total = rows[0] ? Number(rows[0].total_count) : 0;

  return {
    total,
    limit,
    offset,
    hasNext: offset + limit < total,
    hasPrevious: offset > 0,
    items,
  };
}

// ---------------------------------------------------------------------------
// Events (GET /api/dashboard/events)
// ---------------------------------------------------------------------------
export interface DashboardEvent {
  type: DashboardEventTypeWire;
  incidentId: number;
  projectId: string;
  checkId: string;
  severity: IncidentSeverity;
  title: string;
  timestamp: string;
}

function toEventTypeWire(type: string): DashboardEventTypeWire {
  return type.toLowerCase() as DashboardEventTypeWire;
}

// Events sind aktuell eine Union aus INCIDENT_OPENED/INCIDENT_RESOLVED.
// "Kritische Checks" stecken darin bereits als severity = CRITICAL auf
// INCIDENT_OPENED-Events - ein eigener Event pro Check-Lauf wuerde bei
// anhaltenden Ausfaellen spammen, da Incidents bereits dedupliziert sind.
// CHECK_WARNING/CHECK_ERROR/CHECK_OFFLINE/AI_ANALYSIS_CREATED sind im
// DashboardEventType bereits als Datenmodell vorbereitet, werden hier aber
// noch nicht erzeugt. Intern wird durchgehend DashboardEventType (GROSS)
// verwendet; die API gibt ausschliesslich die lowercase-Variante nach aussen.
export async function getRecentEvents(limit = DEFAULT_EVENTS_LIMIT): Promise<DashboardEvent[]> {
  const { rows } = await pool.query<{
    incident_id: number;
    project_id: string;
    check_id: string;
    severity: string;
    title: string;
    event_type: string;
    timestamp: string | Date;
  }>(
    `SELECT * FROM (
       SELECT id AS incident_id, project_id, check_id, severity, title,
              $2 AS event_type, created_at AS timestamp
       FROM incidents
       UNION ALL
       SELECT id AS incident_id, project_id, check_id, severity, title,
              $3 AS event_type, resolved_at AS timestamp
       FROM incidents
       WHERE resolved = true AND resolved_at IS NOT NULL
     ) events
     ORDER BY timestamp DESC
     LIMIT $1`,
    [limit, DashboardEventType.INCIDENT_OPENED, DashboardEventType.INCIDENT_RESOLVED],
  );

  return rows.map((row) => ({
    type: toEventTypeWire(row.event_type),
    incidentId: row.incident_id,
    projectId: row.project_id,
    checkId: row.check_id,
    severity: row.severity as IncidentSeverity,
    title: row.title,
    timestamp: toIsoString(row.timestamp),
  }));
}
