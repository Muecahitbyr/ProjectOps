import { pool } from "./pool";
import type { ProjectConfig } from "../types/project.types";
import type { CheckStatus } from "../types/check-result.types";

// Phase 15 "Multi-Tenant Architektur" - projects.config.ts kennt selbst
// keine Organisation; ein neu in der Konfiguration hinzugefuegtes Projekt
// wird (wie beim automatischen Backfill in Migration 0033) der
// Default-Organisation zugeordnet, bis es ueber die Organizations-Seite
// echt umgehaengt wird. ON CONFLICT laesst organization_id bei bereits
// bestehenden Projekten unangetastet, damit eine manuelle Umzuordnung nicht
// bei jedem Sync rueckgaengig gemacht wird.
async function resolveDefaultOrganizationId(): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(`SELECT id FROM organizations WHERE slug = 'default'`);
  const id = rows[0]?.id;
  if (!id) {
    throw new Error("Default-Organisation nicht gefunden - Migration 0033 wurde nicht angewendet");
  }
  return id;
}

// Haelt projects und checks mit der Konfigurationsdatei synchron.
// Config-Datei bleibt Source of Truth, die DB ist der persistente Spiegel
// (u.a. als Foreign-Key-Ziel fuer check_results und incidents).
export async function syncProjects(projects: ProjectConfig[]): Promise<void> {
  const defaultOrganizationId = await resolveDefaultOrganizationId();

  for (const project of projects) {
    await pool.query(
      `INSERT INTO projects (id, name, type, description, config, organization_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name,
           type = EXCLUDED.type,
           description = EXCLUDED.description,
           config = EXCLUDED.config,
           updated_at = now()`,
      [project.id, project.name, project.type, project.description ?? null, JSON.stringify(project), defaultOrganizationId],
    );

    for (const check of project.checks) {
      await pool.query(
        `INSERT INTO checks (id, project_id, type, target, interval_minutes, enabled)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE
         SET project_id = EXCLUDED.project_id,
             type = EXCLUDED.type,
             target = EXCLUDED.target,
             interval_minutes = EXCLUDED.interval_minutes,
             enabled = EXCLUDED.enabled`,
        [check.id, project.id, check.type, check.target ?? null, check.intervalMinutes, check.enabled],
      );
    }
  }
}

export type ProjectHealthStatus = "healthy" | "warning" | "failed" | "unknown";

export interface ProjectCheckStatus {
  checkId: string;
  type: string;
  target: string | null;
  enabled: boolean;
  status: CheckStatus | null;
  responseTimeMs: number | null;
  checkedAt: string | null;
}

export interface ProjectStatus {
  projectId: string;
  projectName: string;
  status: ProjectHealthStatus;
  checks: ProjectCheckStatus[];
  openIncidents: number;
}

// Phase 16 Auftragspunkt 4 "Tenant Isolation" - fuer
// GET /api/v1/projects/:id (routes/v1/projects.routes.ts): bevor
// Projektdaten zurueckgegeben werden, wird geprueft, ob das Projekt
// tatsaechlich zur Organisation des authentifizierten API-Keys gehoert.
export async function getProjectOrganizationId(projectId: string): Promise<string | undefined> {
  const { rows } = await pool.query<{ organization_id: string }>(`SELECT organization_id FROM projects WHERE id = $1`, [projectId]);
  return rows[0]?.organization_id;
}

// Fuer GET /api/v1/incidents - die Projekt-ids der Organisation, um
// incidents.repository.ts.getIncidents() tenant-sicher einzuschraenken.
export async function getProjectIdsForOrganization(organizationId: string): Promise<string[]> {
  const { rows } = await pool.query<{ id: string }>(`SELECT id FROM projects WHERE organization_id = $1`, [organizationId]);
  return rows.map((row) => row.id);
}

export async function getProjectStatus(projectId: string): Promise<ProjectStatus | undefined> {
  const { rows: projectRows } = await pool.query<{ id: string; name: string }>(
    `SELECT id, name FROM projects WHERE id = $1`,
    [projectId],
  );
  const projectRow = projectRows[0];
  if (!projectRow) {
    return undefined;
  }

  const { rows: checkRows } = await pool.query<{
    check_id: string;
    type: string;
    target: string | null;
    enabled: boolean;
    status: string | null;
    response_time_ms: number | null;
    checked_at: string | Date | null;
  }>(
    `SELECT
       c.id AS check_id,
       c.type,
       c.target,
       c.enabled,
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
     WHERE c.project_id = $1
     ORDER BY c.id`,
    [projectId],
  );

  const checks: ProjectCheckStatus[] = checkRows.map((row) => ({
    checkId: row.check_id,
    type: row.type,
    target: row.target,
    enabled: row.enabled,
    status: row.status as CheckStatus | null,
    responseTimeMs: row.response_time_ms,
    checkedAt: row.checked_at instanceof Date ? row.checked_at.toISOString() : row.checked_at,
  }));

  const { rows: incidentCountRows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM incidents WHERE project_id = $1 AND resolved = false`,
    [projectId],
  );
  const openIncidents = Number(incidentCountRows[0]?.count ?? 0);

  const statuses = checks.map((check) => check.status).filter((s): s is CheckStatus => s !== null);

  let status: ProjectHealthStatus = "unknown";
  if (statuses.length > 0) {
    if (statuses.some((s) => s === "ERROR" || s === "OFFLINE")) {
      status = "failed";
    } else if (statuses.some((s) => s === "WARNING")) {
      status = "warning";
    } else {
      status = "healthy";
    }
  }

  return {
    projectId: projectRow.id,
    projectName: projectRow.name,
    status,
    checks,
    openIncidents,
  };
}
