import { pool } from "./pool";
import type { Deployment, DeploymentStatus } from "../types/deployment.types";

interface DeploymentRow {
  id: string | number;
  project_id: string;
  environment: string;
  version: string;
  status: string;
  description: string | null;
  deployed_by: string | null;
  deployed_at: string | Date;
  created_at: string | Date;
}

const COLUMNS = `id, project_id, environment, version, status, description, deployed_by, deployed_at, created_at`;

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

// deployments.id ist BIGSERIAL - der pg-Treiber liefert BIGINT-Spalten als
// String zurueck. Explizite Number()-Konvertierung hier, sonst landet ein
// String statt einer Zahl in der JSON-Antwort (bereits zweimal als echter
// Bug gefunden: Phase 25 wouldCreateCycle(), Phase 26 postmortems.
// repository.ts - hier von vornherein korrekt).
function mapRow(row: DeploymentRow): Deployment {
  return {
    id: Number(row.id),
    projectId: row.project_id,
    environment: row.environment,
    version: row.version,
    status: row.status as DeploymentStatus,
    description: row.description,
    deployedBy: row.deployed_by,
    deployedAt: toIso(row.deployed_at),
    createdAt: toIso(row.created_at),
  };
}

export interface CreateDeploymentInput {
  projectId: string;
  environment?: string;
  version: string;
  status?: DeploymentStatus;
  description?: string;
  deployedBy?: string;
  deployedAt?: string;
}

export async function createDeployment(input: CreateDeploymentInput): Promise<Deployment> {
  const { rows } = await pool.query<DeploymentRow>(
    `INSERT INTO deployments (project_id, environment, version, status, description, deployed_by, deployed_at)
     VALUES ($1, COALESCE($2, 'production'), $3, COALESCE($4, 'SUCCESS'), $5, $6, COALESCE($7, now()))
     RETURNING ${COLUMNS}`,
    [
      input.projectId,
      input.environment ?? null,
      input.version,
      input.status ?? null,
      input.description ?? null,
      input.deployedBy ?? null,
      input.deployedAt ?? null,
    ],
  );
  return mapRow(rows[0]!);
}

export interface ListDeploymentsFilter {
  projectId?: string;
  projectIds?: string[];
  environment?: string;
  status?: DeploymentStatus;
  limit?: number;
  offset?: number;
}

export async function listDeployments(filter: ListDeploymentsFilter): Promise<Deployment[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filter.projectId) {
    params.push(filter.projectId);
    conditions.push(`project_id = $${params.length}`);
  }
  if (filter.projectIds) {
    params.push(filter.projectIds);
    conditions.push(`project_id = ANY($${params.length})`);
  }
  if (filter.environment) {
    params.push(filter.environment);
    conditions.push(`environment = $${params.length}`);
  }
  if (filter.status) {
    params.push(filter.status);
    conditions.push(`status = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = filter.limit ?? 50;
  params.push(limit);
  const limitPlaceholder = `$${params.length}`;
  params.push(filter.offset ?? 0);
  const offsetPlaceholder = `$${params.length}`;

  const { rows } = await pool.query<DeploymentRow>(
    `SELECT ${COLUMNS} FROM deployments ${where} ORDER BY deployed_at DESC LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}`,
    params,
  );
  return rows.map(mapRow);
}

export async function countDeployments(filter: Omit<ListDeploymentsFilter, "limit" | "offset">): Promise<number> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filter.projectId) {
    params.push(filter.projectId);
    conditions.push(`project_id = $${params.length}`);
  }
  if (filter.projectIds) {
    params.push(filter.projectIds);
    conditions.push(`project_id = ANY($${params.length})`);
  }
  if (filter.environment) {
    params.push(filter.environment);
    conditions.push(`environment = $${params.length}`);
  }
  if (filter.status) {
    params.push(filter.status);
    conditions.push(`status = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await pool.query<{ count: string }>(`SELECT COUNT(*) AS count FROM deployments ${where}`, params);
  return Number(rows[0]!.count);
}

export async function getDeploymentById(id: number): Promise<Deployment | undefined> {
  const { rows } = await pool.query<DeploymentRow>(`SELECT ${COLUMNS} FROM deployments WHERE id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : undefined;
}

// Auftragspunkt "Incident-Korrelation" - Deployments desselben Projekts im
// Fenster [beforeTimestamp - windowMinutes, beforeTimestamp], neueste
// zuerst. Nutzt denselben (project_id, deployed_at)-Index wie
// listDeployments.
export async function getRecentDeploymentsForProject(
  projectId: string,
  beforeTimestamp: string,
  windowMinutes: number,
  limit = 10,
): Promise<Deployment[]> {
  const { rows } = await pool.query<DeploymentRow>(
    `SELECT ${COLUMNS} FROM deployments
     WHERE project_id = $1
       AND deployed_at <= $2::timestamptz
       AND deployed_at >= $2::timestamptz - ($3 || ' minutes')::interval
     ORDER BY deployed_at DESC
     LIMIT $4`,
    [projectId, beforeTimestamp, windowMinutes, limit],
  );
  return rows.map(mapRow);
}

export async function deleteDeployment(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM deployments WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}
