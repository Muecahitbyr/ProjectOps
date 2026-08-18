import { pool } from "../db/pool";
import { getProjectHealth } from "../db/dashboard.repository";
import { getEnabledAlertRulesForProject } from "../db/alerts.repository";
import { getRecentDeploymentsForProject } from "../db/deployments.repository";
import { getProjectName } from "../config/projects.config";
import { DEFAULT_DEPLOYMENT_CORRELATION_WINDOW_MINUTES } from "../types/deployment.types";
import type {
  DiagnosticSnapshotAlertEntry,
  DiagnosticSnapshotCheckEntry,
  DiagnosticSnapshotContent,
  DiagnosticSnapshotDeploymentEntry,
} from "../types/diagnostic-snapshot.types";

interface LastCheckRow {
  check_id: string;
  type: string;
  target: string | null;
  status: string | null;
  response_time_ms: number | null;
  error: string | null;
  checked_at: string | Date | null;
}

async function loadLastChecks(projectId: string): Promise<DiagnosticSnapshotCheckEntry[]> {
  const { rows } = await pool.query<LastCheckRow>(
    `SELECT DISTINCT ON (c.id)
       c.id AS check_id, c.type, c.target, cr.status, cr.response_time_ms, cr.error, cr.checked_at
     FROM checks c
     LEFT JOIN check_results cr ON cr.check_id = c.id
     WHERE c.project_id = $1 AND c.enabled = true
     ORDER BY c.id, cr.checked_at DESC`,
    [projectId],
  );

  return rows.map((row) => ({
    checkId: row.check_id,
    type: row.type,
    target: row.target,
    status: row.status,
    responseTimeMs: row.response_time_ms,
    error: row.error,
    checkedAt: row.checked_at === null ? null : row.checked_at instanceof Date ? row.checked_at.toISOString() : row.checked_at,
  }));
}

async function loadActiveAlerts(projectId: string): Promise<DiagnosticSnapshotAlertEntry[]> {
  const rules = await getEnabledAlertRulesForProject(projectId);
  return rules
    .filter((rule) => rule.currentlyTriggered)
    .map((rule) => ({
      ruleId: rule.id,
      name: rule.name,
      severity: rule.severity,
      lastTriggeredValue: rule.lastTriggeredValue,
      lastTriggeredAt: rule.lastTriggeredAt,
    }));
}

// Auftragspunkt 6 "Diagnostic Snapshots" - buendelt den kompletten
// Beobachtungszustand eines Projekts zu einem Zeitpunkt (Health-Score,
// letzte Check-Ergebnisse inkl. Antwortzeiten/Fehlern, aktuell ausgeloeste
// Alerts) fuer die spaetere Fehleranalyse. Wird sowohl beim Oeffnen eines
// Incidents (core/monitor.ts) als auch von der sicheren Automation-Aktion
// CREATE_DIAGNOSTIC_SNAPSHOT (automation/safe-action-runner.ts) aufgerufen.
async function loadRecentDeployments(projectId: string, asOf: string): Promise<DiagnosticSnapshotDeploymentEntry[]> {
  const deployments = await getRecentDeploymentsForProject(projectId, asOf, DEFAULT_DEPLOYMENT_CORRELATION_WINDOW_MINUTES, 10);
  return deployments.map((d) => ({
    id: d.id,
    version: d.version,
    environment: d.environment,
    status: d.status,
    deployedAt: d.deployedAt,
  }));
}

export async function buildDiagnosticSnapshotContent(projectId: string): Promise<DiagnosticSnapshotContent> {
  const generatedAt = new Date().toISOString();
  const [health, lastChecks, activeAlerts, activeDeployments] = await Promise.all([
    getProjectHealth(projectId),
    loadLastChecks(projectId),
    loadActiveAlerts(projectId),
    // Phase 27 "Enterprise Deployment Tracking & Change Correlation" - loest
    // das seit Phase 10 vorbereitete, bis dahin immer leere Feld ein
    // (siehe types/diagnostic-snapshot.types.ts): Deployments dieses
    // Projekts im Korrelationsfenster vor dem Snapshot-Zeitpunkt.
    loadRecentDeployments(projectId, generatedAt),
  ]);

  return {
    projectId,
    projectName: getProjectName(projectId),
    healthScore: health?.health.score ?? 0,
    lastChecks,
    activeAlerts,
    activeDeployments,
    generatedAt,
  };
}
