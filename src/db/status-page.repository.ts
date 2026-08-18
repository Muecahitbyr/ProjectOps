import { pool } from "./pool";
import { getAllProjectsHealth } from "./dashboard.repository";
import { getActiveMaintenanceWindow, listMaintenanceWindows } from "./maintenance.repository";
import type {
  PublicIncidentStatus,
  PublicIncidentSummary,
  PublicStatusHistory,
  PublicStatusHistoryBucket,
  PublicStatusPage,
  PublicProjectStatus,
} from "../types/status-page.types";

// Phase 13 Teil 3 "Public Status Page" - eigenstaendige, bewusst reduzierte
// Abfragen statt bestehende, interne Analytics-Funktionen (z.B. das private
// getAvailabilityPercent() in analytics.repository.ts) zu exportieren. Diese
// Datei ist die einzige Stelle, die je oeffentlich (ohne Auth) erreichbar
// ist - eine strikte Trennung von den authentifizierten Analytics-Abfragen
// macht auf einen Blick nachvollziehbar, dass hier niemals interne Daten
// (User, AI, Automation) mit hineinrutschen koennen.
async function getUptimePercent(projectId: string, hours: number): Promise<number> {
  const { rows } = await pool.query<{ total: string; online: string }>(
    `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE cr.status = 'ONLINE') AS online
     FROM check_results cr JOIN checks c ON c.id = cr.check_id
     WHERE c.project_id = $1 AND cr.checked_at >= now() - ($2 || ' hours')::interval`,
    [projectId, hours],
  );
  const total = Number(rows[0]?.total ?? 0);
  const online = Number(rows[0]?.online ?? 0);
  return total === 0 ? 100 : Number(((online / total) * 100).toFixed(2));
}

async function classifyProjectStatus(
  projectId: string,
  healthStatus: "healthy" | "warning" | "critical",
): Promise<{ status: PublicIncidentStatus; activeMaintenance: { reason: string; endsAt: string } | null }> {
  const maintenanceWindow = await getActiveMaintenanceWindow(projectId);
  if (maintenanceWindow) {
    return { status: "maintenance", activeMaintenance: { reason: maintenanceWindow.reason, endsAt: maintenanceWindow.endsAt } };
  }

  const { rows } = await pool.query<{ max_severity: string | null }>(
    `SELECT MAX(CASE severity WHEN 'CRITICAL' THEN 4 WHEN 'HIGH' THEN 3 WHEN 'MEDIUM' THEN 2 ELSE 1 END) AS max_severity
     FROM incidents WHERE project_id = $1 AND resolved = false`,
    [projectId],
  );
  const maxSeverity = rows[0]?.max_severity ? Number(rows[0].max_severity) : 0;

  let status: PublicIncidentStatus;
  if (maxSeverity >= 4) status = "major_outage";
  else if (maxSeverity === 3) status = "partial_outage";
  else if (maxSeverity >= 1 || healthStatus === "warning") status = "degraded";
  else status = "operational";

  return { status, activeMaintenance: null };
}

const STATUS_RANK: Record<PublicIncidentStatus, number> = {
  operational: 0,
  maintenance: 1,
  degraded: 2,
  partial_outage: 3,
  major_outage: 4,
};

// Keine internen Daten: nur Projektname/-status, Verfuegbarkeit, aktive
// Incidents (Titel+Schweregrad+Zeiten, keine KI-Analyse/Automation/User-
// Bezug) und geplante Wartungen.
export async function getPublicStatusPage(): Promise<PublicStatusPage> {
  const projectsHealth = await getAllProjectsHealth();

  const projects: PublicProjectStatus[] = await Promise.all(
    projectsHealth.map(async (project) => {
      const [classification, uptime24h, uptime90d] = await Promise.all([
        classifyProjectStatus(project.id, project.health.status),
        getUptimePercent(project.id, 24),
        getUptimePercent(project.id, 24 * 90),
      ]);
      return {
        id: project.id,
        name: project.name,
        status: classification.status,
        uptimePercent24h: uptime24h,
        uptimePercent90d: uptime90d,
        activeMaintenance: classification.activeMaintenance,
      };
    }),
  );

  const overallStatus = projects.reduce<PublicIncidentStatus>(
    (worst, project) => (STATUS_RANK[project.status] > STATUS_RANK[worst] ? project.status : worst),
    "operational",
  );

  const { rows: incidentRows } = await pool.query<{
    project_id: string;
    project_name: string;
    title: string;
    severity: string;
    created_at: string | Date;
  }>(
    `SELECT i.project_id, p.name AS project_name, i.title, i.severity, i.created_at
     FROM incidents i JOIN projects p ON p.id = i.project_id
     WHERE i.resolved = false ORDER BY i.created_at DESC LIMIT 50`,
  );
  const activeIncidents: PublicIncidentSummary[] = incidentRows.map((row) => ({
    projectId: row.project_id,
    projectName: row.project_name,
    title: row.title,
    severity: row.severity,
    startedAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    resolvedAt: null,
  }));

  const allMaintenance = await listMaintenanceWindows();
  const now = Date.now();
  const upcomingMaintenance = allMaintenance
    .filter((window) => new Date(window.startsAt).getTime() > now)
    .map((window) => ({
      projectId: window.projectId,
      projectName: projects.find((project) => project.id === window.projectId)?.name ?? window.projectId,
      reason: window.reason,
      startsAt: window.startsAt,
      endsAt: window.endsAt,
    }));

  return {
    generatedAt: new Date().toISOString(),
    overallStatus,
    projects,
    activeIncidents,
    upcomingMaintenance,
  };
}

function classifyBucket(total: number, online: number, hasMaintenance: boolean): PublicIncidentStatus {
  if (total === 0) return hasMaintenance ? "maintenance" : "operational";
  const uptimeRatio = online / total;
  if (hasMaintenance) return "maintenance";
  if (uptimeRatio >= 0.999) return "operational";
  if (uptimeRatio >= 0.98) return "degraded";
  if (uptimeRatio >= 0.9) return "partial_outage";
  return "major_outage";
}

// Teil 4 "Status History" - Buckets pro Stunde (<=7 Tage) oder pro Tag
// (>7 Tage), aus echten check_results berechnet.
export async function getPublicStatusHistory(projectId: string, days: number): Promise<PublicStatusHistory> {
  const bucketUnit = days <= 7 ? "hour" : "day";
  const { rows } = await pool.query<{
    bucket: string | Date;
    total: string;
    online: string;
    avg_response_time: string | null;
  }>(
    `SELECT date_trunc($3, cr.checked_at) AS bucket,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE cr.status = 'ONLINE') AS online,
            AVG(cr.response_time_ms) AS avg_response_time
     FROM check_results cr JOIN checks c ON c.id = cr.check_id
     WHERE c.project_id = $1 AND cr.checked_at >= now() - ($2 || ' days')::interval
     GROUP BY bucket ORDER BY bucket`,
    [projectId, days, bucketUnit],
  );

  const { rows: maintenanceRows } = await pool.query<{ starts_at: string | Date; ends_at: string | Date }>(
    `SELECT starts_at, ends_at FROM maintenance_windows
     WHERE project_id = $1 AND ends_at >= now() - ($2 || ' days')::interval`,
    [projectId, days],
  );
  const maintenanceRanges = maintenanceRows.map((row) => ({
    start: new Date(row.starts_at).getTime(),
    end: new Date(row.ends_at).getTime(),
  }));

  const buckets: PublicStatusHistoryBucket[] = rows.map((row) => {
    const bucketStart = row.bucket instanceof Date ? row.bucket : new Date(row.bucket);
    const hasMaintenance = maintenanceRanges.some((range) => bucketStart.getTime() >= range.start && bucketStart.getTime() < range.end);
    const total = Number(row.total);
    const online = Number(row.online);
    return {
      bucketStart: bucketStart.toISOString(),
      status: classifyBucket(total, online, hasMaintenance),
      uptimePercent: total === 0 ? 100 : Number(((online / total) * 100).toFixed(2)),
      averageResponseTimeMs: row.avg_response_time !== null ? Math.round(Number(row.avg_response_time)) : null,
    };
  });

  return { projectId, rangeDays: days, buckets };
}
