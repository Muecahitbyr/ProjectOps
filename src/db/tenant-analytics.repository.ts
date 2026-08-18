import { pool } from "./pool";
import type { TenantAnalytics } from "../types/platform.types";

// Phase 15 Teil 8 "Tenant Analytics" - jede Kennzahl wird ueber
// projects.organization_id aus bereits bestehenden Tabellen abgeleitet
// (Incidents, Alert-Regeln, Automation-Ausfuehrungen, Notifications,
// Check-Ergebnisse), keine neue Parallel-Datenhaltung. Optionaler
// teamId-Filter ("filterbar nach Organisation und Team") grenzt auf die
// ueber project_teams verknuepften Projekte ein - $3 ist entweder null
// (kein Filter) oder die reale Projekt-id-Liste des Teams; apiUsageCount
// bleibt bewusst organisationsweit, da api_keys keine Team-Zuordnung hat
// (ehrliche Einschraenkung statt einer erfundenen Team-Aufteilung).
export async function getTenantAnalytics(organizationId: string, hours: number, teamId?: string): Promise<TenantAnalytics | undefined> {
  const { rows: orgRows } = await pool.query<{ id: string; name: string }>(`SELECT id, name FROM organizations WHERE id = $1`, [organizationId]);
  const org = orgRows[0];
  if (!org) {
    return undefined;
  }

  let projectIds: string[] | null = null;
  if (teamId) {
    const { rows } = await pool.query<{ project_id: string }>(`SELECT project_id FROM project_teams WHERE team_id = $1`, [teamId]);
    projectIds = rows.map((row) => row.project_id);
  }

  const [
    projectCountResult,
    incidentCountResult,
    alertCountResult,
    automationCountResult,
    healthResult,
    responseTimeResult,
    notificationCountResult,
    apiUsageResult,
    recordsStoredResult,
  ] = await Promise.all([
    pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM projects p WHERE p.organization_id = $1 AND ($2::text[] IS NULL OR p.id = ANY($2::text[]))`,
      [organizationId, projectIds],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM incidents i JOIN projects p ON p.id = i.project_id
       WHERE p.organization_id = $1 AND i.created_at >= now() - ($2 || ' hours')::interval AND ($3::text[] IS NULL OR p.id = ANY($3::text[]))`,
      [organizationId, hours, projectIds],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM alert_rules ar JOIN projects p ON p.id = ar.project_id
       WHERE p.organization_id = $1 AND ar.last_triggered_at >= now() - ($2 || ' hours')::interval AND ($3::text[] IS NULL OR p.id = ANY($3::text[]))`,
      [organizationId, hours, projectIds],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM automation_executions ae
       JOIN automation_actions aa ON aa.id = ae.automation_action_id
       JOIN projects p ON p.id = aa.project_id
       WHERE p.organization_id = $1 AND ae.created_at >= now() - ($2 || ' hours')::interval AND ($3::text[] IS NULL OR p.id = ANY($3::text[]))`,
      [organizationId, hours, projectIds],
    ),
    pool.query<{ avg_online: string | null }>(
      `SELECT (100.0 * COUNT(*) FILTER (WHERE cr.status = 'ONLINE') / NULLIF(COUNT(*), 0)) AS avg_online
       FROM check_results cr JOIN checks c ON c.id = cr.check_id JOIN projects p ON p.id = c.project_id
       WHERE p.organization_id = $1 AND cr.checked_at >= now() - ($2 || ' hours')::interval AND ($3::text[] IS NULL OR p.id = ANY($3::text[]))`,
      [organizationId, hours, projectIds],
    ),
    pool.query<{ avg_response: string | null }>(
      `SELECT AVG(cr.response_time_ms) AS avg_response
       FROM check_results cr JOIN checks c ON c.id = cr.check_id JOIN projects p ON p.id = c.project_id
       WHERE p.organization_id = $1 AND cr.checked_at >= now() - ($2 || ' hours')::interval AND cr.response_time_ms IS NOT NULL AND ($3::text[] IS NULL OR p.id = ANY($3::text[]))`,
      [organizationId, hours, projectIds],
    ),
    pool.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM notification_events ne JOIN projects p ON p.id = ne.project_id
       WHERE p.organization_id = $1 AND ne.created_at >= now() - ($2 || ' hours')::interval AND ($3::text[] IS NULL OR p.id = ANY($3::text[]))`,
      [organizationId, hours, projectIds],
    ),
    pool.query<{ total: string | null }>(`SELECT COALESCE(SUM(usage_count), 0) AS total FROM api_keys WHERE organization_id = $1`, [organizationId]),
    pool.query<{ count: string }>(
      `SELECT
        (SELECT COUNT(*) FROM check_results cr JOIN checks c ON c.id = cr.check_id JOIN projects p ON p.id = c.project_id WHERE p.organization_id = $1 AND ($2::text[] IS NULL OR p.id = ANY($2::text[]))) +
        (SELECT COUNT(*) FROM incidents i JOIN projects p ON p.id = i.project_id WHERE p.organization_id = $1 AND ($2::text[] IS NULL OR p.id = ANY($2::text[]))) +
        (SELECT COUNT(*) FROM audit_log WHERE project_id IN (SELECT id FROM projects WHERE organization_id = $1 AND ($2::text[] IS NULL OR id = ANY($2::text[]))))
        AS count`,
      [organizationId, projectIds],
    ),
  ]);

  return {
    organizationId: org.id,
    organizationName: org.name,
    projectCount: Number(projectCountResult.rows[0]?.count ?? 0),
    incidentCount: Number(incidentCountResult.rows[0]?.count ?? 0),
    alertCount: Number(alertCountResult.rows[0]?.count ?? 0),
    automationExecutionCount: Number(automationCountResult.rows[0]?.count ?? 0),
    averageHealthScore: healthResult.rows[0]?.avg_online !== null && healthResult.rows[0]?.avg_online !== undefined ? Math.round(Number(healthResult.rows[0].avg_online)) : null,
    averageResponseTimeMs: responseTimeResult.rows[0]?.avg_response !== null && responseTimeResult.rows[0]?.avg_response !== undefined ? Math.round(Number(responseTimeResult.rows[0].avg_response)) : null,
    notificationCount: Number(notificationCountResult.rows[0]?.count ?? 0),
    apiUsageCount: Number(apiUsageResult.rows[0]?.total ?? 0),
    recordsStored: Number(recordsStoredResult.rows[0]?.count ?? 0),
  };
}

export async function listTenantAnalyticsForAllOrganizations(hours: number): Promise<TenantAnalytics[]> {
  const { rows } = await pool.query<{ id: string }>(`SELECT id FROM organizations ORDER BY name`);
  const results: TenantAnalytics[] = [];
  for (const row of rows) {
    const analytics = await getTenantAnalytics(row.id, hours);
    if (analytics) {
      results.push(analytics);
    }
  }
  return results;
}
