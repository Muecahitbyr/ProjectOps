import { pool } from "./pool";
import type { Service, ServiceCriticality, ServiceEnvironment, ServiceLifecycleStatus, ServiceObservability } from "../types/service.types";

interface ServiceRow {
  id: number;
  organization_id: string;
  team_id: string | null;
  project_id: string | null;
  name: string;
  description: string | null;
  technical_owner_id: string | null;
  business_owner: string | null;
  criticality: string;
  environment: string;
  lifecycle_status: string;
  observability: string;
  created_by: string | null;
  created_at: string | Date;
  updated_at: string | Date;
  escalation_policy_id: string | number | null;
}

const SERVICE_COLUMNS = `
  id, organization_id, team_id, project_id, name, description, technical_owner_id, business_owner,
  criticality, environment, lifecycle_status, observability, created_by, created_at, updated_at, escalation_policy_id
`;

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function mapRow(row: ServiceRow): Service {
  return {
    // Auftragspunkt 24/25 - der pg-Treiber liefert BIGSERIAL-Spalten zur
    // Laufzeit als STRING (kein registrierter Typ-Parser fuer OID 20/int8),
    // obwohl "id: number" typisiert ist. Fuer Werte in diesem sicheren
    // Bereich (Quoten deckeln bei wenigen tausend Zeilen, weit unter
    // Number.MAX_SAFE_INTEGER) wird HIER, an der Repository-Grenze, einmalig
    // ehrlich in eine echte Number geparst - das behebt einen echten,
    // beim Live-E2E-Test gefundenen Bug (Set-basierte Zyklus-/Besuchs-
    // Erkennung in core/topology.ts und core/service-health.ts vergleicht
    // sonst faelschlich String gegen Number) an der Quelle statt an jeder
    // einzelnen Vergleichsstelle.
    id: Number(row.id),
    organizationId: row.organization_id,
    teamId: row.team_id,
    projectId: row.project_id,
    name: row.name,
    description: row.description,
    technicalOwnerId: row.technical_owner_id,
    businessOwner: row.business_owner,
    criticality: row.criticality as ServiceCriticality,
    environment: row.environment as ServiceEnvironment,
    lifecycleStatus: row.lifecycle_status as ServiceLifecycleStatus,
    observability: row.observability as ServiceObservability,
    createdBy: row.created_by,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    escalationPolicyId: row.escalation_policy_id === null ? null : Number(row.escalation_policy_id),
  };
}

export interface CreateServiceInput {
  organizationId: string;
  teamId?: string | null;
  projectId?: string | null;
  name: string;
  description?: string | null;
  technicalOwnerId?: string | null;
  businessOwner?: string | null;
  criticality?: ServiceCriticality;
  environment?: ServiceEnvironment;
  lifecycleStatus?: ServiceLifecycleStatus;
  observability?: ServiceObservability;
  createdBy?: string | null;
}

export interface UpdateServiceInput {
  name?: string;
  description?: string | null;
  teamId?: string | null;
  projectId?: string | null;
  technicalOwnerId?: string | null;
  businessOwner?: string | null;
  criticality?: ServiceCriticality;
  environment?: ServiceEnvironment;
  lifecycleStatus?: ServiceLifecycleStatus;
  observability?: ServiceObservability;
  escalationPolicyId?: number | null;
}

export interface ListServicesFilter {
  organizationId?: string;
  teamId?: string;
  projectId?: string;
  criticality?: ServiceCriticality;
  environment?: ServiceEnvironment;
  lifecycleStatus?: ServiceLifecycleStatus;
  observability?: ServiceObservability;
}

export async function listServices(filter: ListServicesFilter = {}): Promise<Service[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (filter.organizationId) {
    values.push(filter.organizationId);
    conditions.push(`organization_id = $${values.length}`);
  }
  if (filter.teamId) {
    values.push(filter.teamId);
    conditions.push(`team_id = $${values.length}`);
  }
  if (filter.projectId) {
    values.push(filter.projectId);
    conditions.push(`project_id = $${values.length}`);
  }
  if (filter.criticality) {
    values.push(filter.criticality);
    conditions.push(`criticality = $${values.length}`);
  }
  if (filter.environment) {
    values.push(filter.environment);
    conditions.push(`environment = $${values.length}`);
  }
  if (filter.lifecycleStatus) {
    values.push(filter.lifecycleStatus);
    conditions.push(`lifecycle_status = $${values.length}`);
  }
  if (filter.observability) {
    values.push(filter.observability);
    conditions.push(`observability = $${values.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await pool.query<ServiceRow>(`SELECT ${SERVICE_COLUMNS} FROM services ${where} ORDER BY name ASC`, values);
  return rows.map(mapRow);
}

export async function getServiceById(id: number): Promise<Service | undefined> {
  const { rows } = await pool.query<ServiceRow>(`SELECT ${SERVICE_COLUMNS} FROM services WHERE id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function getServicesByIds(ids: number[]): Promise<Service[]> {
  if (ids.length === 0) return [];
  const { rows } = await pool.query<ServiceRow>(`SELECT ${SERVICE_COLUMNS} FROM services WHERE id = ANY($1::bigint[])`, [ids]);
  return rows.map(mapRow);
}

// Phase 24 - fuer authorizePlatformOrOrganizationMembership()/-Role()
// (middleware/authorize.ts): die Organisation einer bestehenden Ressource
// aufloesen, ohne die komplette Zeile zu laden, analog zu
// getSloOrganizationId() (db/slo.repository.ts, Phase 22). War bereits
// vorhanden, bisher aber nie verwendet.
export async function getServiceOrganizationId(id: number): Promise<string | undefined> {
  const { rows } = await pool.query<{ organization_id: string }>(`SELECT organization_id FROM services WHERE id = $1`, [id]);
  return rows[0]?.organization_id;
}

export async function getServiceByProjectId(projectId: string): Promise<Service | undefined> {
  const { rows } = await pool.query<ServiceRow>(`SELECT ${SERVICE_COLUMNS} FROM services WHERE project_id = $1`, [projectId]);
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function countServicesForOrganization(organizationId: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(`SELECT COUNT(*) AS count FROM services WHERE organization_id = $1`, [organizationId]);
  return Number(rows[0]?.count ?? 0);
}

// Auftragspunkt 21 "Quotas" - dieselbe race-sichere SELECT...FOR UPDATE-
// Transaktion wie createSloIfUnderQuota()/createAlertRuleIfUnderQuota()
// (Phase 21/22): COUNT + INSERT ohne Sperre ist explizit verboten.
export async function createServiceIfUnderQuota(input: CreateServiceInput, maxServices: number): Promise<Service | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT id FROM organizations WHERE id = $1 FOR UPDATE`, [input.organizationId]);
    const { rows: countRows } = await client.query<{ count: string }>(`SELECT COUNT(*) AS count FROM services WHERE organization_id = $1`, [input.organizationId]);
    if (Number(countRows[0]?.count ?? 0) >= maxServices) {
      await client.query("ROLLBACK");
      return null;
    }

    const { rows } = await client.query<ServiceRow>(
      `INSERT INTO services
         (organization_id, team_id, project_id, name, description, technical_owner_id, business_owner, criticality, environment, lifecycle_status, observability, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING ${SERVICE_COLUMNS}`,
      [
        input.organizationId,
        input.teamId ?? null,
        input.projectId ?? null,
        input.name,
        input.description ?? null,
        input.technicalOwnerId ?? null,
        input.businessOwner ?? null,
        input.criticality ?? "MEDIUM",
        input.environment ?? "PRODUCTION",
        input.lifecycleStatus ?? "ACTIVE",
        input.observability ?? "OBSERVABLE",
        input.createdBy ?? null,
      ],
    );
    await client.query("COMMIT");
    const row = rows[0];
    if (!row) {
      throw new Error("Service konnte nicht angelegt werden");
    }
    return mapRow(row);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function updateService(id: number, input: UpdateServiceInput): Promise<Service | undefined> {
  const sets: string[] = [];
  const values: unknown[] = [];
  const set = (column: string, value: unknown): void => {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  };
  if (input.name !== undefined) set("name", input.name);
  if (input.description !== undefined) set("description", input.description);
  if (input.teamId !== undefined) set("team_id", input.teamId);
  if (input.projectId !== undefined) set("project_id", input.projectId);
  if (input.technicalOwnerId !== undefined) set("technical_owner_id", input.technicalOwnerId);
  if (input.businessOwner !== undefined) set("business_owner", input.businessOwner);
  if (input.criticality !== undefined) set("criticality", input.criticality);
  if (input.environment !== undefined) set("environment", input.environment);
  if (input.lifecycleStatus !== undefined) set("lifecycle_status", input.lifecycleStatus);
  if (input.observability !== undefined) set("observability", input.observability);
  if (input.escalationPolicyId !== undefined) set("escalation_policy_id", input.escalationPolicyId);

  if (sets.length === 0) {
    return getServiceById(id);
  }
  sets.push(`updated_at = now()`);
  values.push(id);
  const { rows } = await pool.query<ServiceRow>(`UPDATE services SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING ${SERVICE_COLUMNS}`, values);
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function deleteService(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM services WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}
