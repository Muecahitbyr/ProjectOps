import { pool } from "./pool";
import type {
  CreateOrganizationInput,
  Organization,
  OrganizationMemberWithUser,
  OrganizationRoleId,
  UpdateOrganizationInput,
} from "../types/organization.types";

interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  plan: Organization["plan"];
  status: Organization["status"];
  owner_id: string | null;
  logo_url: string | null;
  brand_color: string | null;
  timezone: string;
  language: string;
  region: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

const COLUMNS = `id, name, slug, plan, status, owner_id, logo_url, brand_color, timezone, language, region, created_at, updated_at`;

function mapRow(row: OrganizationRow): Organization {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    plan: row.plan,
    status: row.status,
    ownerId: row.owner_id,
    logoUrl: row.logo_url,
    brandColor: row.brand_color,
    timezone: row.timezone,
    language: row.language,
    region: row.region,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

export async function listOrganizations(): Promise<Organization[]> {
  const { rows } = await pool.query<OrganizationRow>(`SELECT ${COLUMNS} FROM organizations ORDER BY name`);
  return rows.map(mapRow);
}

export async function getOrganizationById(id: string): Promise<Organization | undefined> {
  const { rows } = await pool.query<OrganizationRow>(`SELECT ${COLUMNS} FROM organizations WHERE id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function getDefaultOrganization(): Promise<Organization | undefined> {
  const { rows } = await pool.query<OrganizationRow>(`SELECT ${COLUMNS} FROM organizations WHERE slug = 'default'`);
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function createOrganization(input: CreateOrganizationInput): Promise<Organization> {
  const { rows } = await pool.query<OrganizationRow>(
    `INSERT INTO organizations (name, slug, plan, timezone, language, region, brand_color, owner_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${COLUMNS}`,
    [
      input.name,
      input.slug,
      input.plan ?? "FREE",
      input.timezone ?? "UTC",
      input.language ?? "en",
      input.region ?? null,
      input.brandColor ?? null,
      input.ownerId ?? null,
    ],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Organisation konnte nicht erstellt werden");
  }
  return mapRow(row);
}

export async function updateOrganization(id: string, input: UpdateOrganizationInput): Promise<Organization | undefined> {
  const { rows } = await pool.query<OrganizationRow>(
    `UPDATE organizations
     SET name = COALESCE($2, name), plan = COALESCE($3, plan), status = COALESCE($4, status),
         timezone = COALESCE($5, timezone), language = COALESCE($6, language), region = COALESCE($7, region),
         brand_color = COALESCE($8, brand_color), updated_at = now()
     WHERE id = $1
     RETURNING ${COLUMNS}`,
    [
      id,
      input.name ?? null,
      input.plan ?? null,
      input.status ?? null,
      input.timezone ?? null,
      input.language ?? null,
      input.region ?? null,
      input.brandColor ?? null,
    ],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

// ---------------------------------------------------------------------------
// Organization Members (Rollenmodell, Auftragspunkt 4)
// ---------------------------------------------------------------------------

interface OrganizationMemberRow {
  id: number;
  organization_id: string;
  user_id: string;
  role_id: OrganizationRoleId;
  created_at: string | Date;
  user_name: string;
  user_email: string;
}

function mapMemberRow(row: OrganizationMemberRow): OrganizationMemberWithUser {
  return {
    id: row.id,
    organizationId: row.organization_id,
    userId: row.user_id,
    roleId: row.role_id,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    userName: row.user_name,
    userEmail: row.user_email,
  };
}

export async function listOrganizationMembers(organizationId: string): Promise<OrganizationMemberWithUser[]> {
  const { rows } = await pool.query<OrganizationMemberRow>(
    `SELECT om.id, om.organization_id, om.user_id, om.role_id, om.created_at, u.name AS user_name, u.email AS user_email
     FROM organization_members om
     JOIN users u ON u.id = om.user_id
     WHERE om.organization_id = $1
     ORDER BY u.name`,
    [organizationId],
  );
  return rows.map(mapMemberRow);
}

export async function getOrganizationMembership(organizationId: string, userId: string): Promise<OrganizationRoleId | undefined> {
  const { rows } = await pool.query<{ role_id: OrganizationRoleId }>(
    `SELECT role_id FROM organization_members WHERE organization_id = $1 AND user_id = $2`,
    [organizationId, userId],
  );
  return rows[0]?.role_id;
}

// "Platform Owner" ist organisationsuebergreifend (Auftragspunkt 9 "Global
// Administration") - true, wenn der Benutzer in IRGENDEINER Organisation
// PLATFORM_OWNER ist.
export async function isPlatformOwner(userId: string): Promise<boolean> {
  const { rows } = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS(SELECT 1 FROM organization_members WHERE user_id = $1 AND role_id = 'PLATFORM_OWNER') AS exists`,
    [userId],
  );
  return rows[0]?.exists ?? false;
}

export async function addOrganizationMember(organizationId: string, userId: string, roleId: OrganizationRoleId): Promise<OrganizationMemberWithUser> {
  const { rows } = await pool.query<OrganizationMemberRow>(
    `INSERT INTO organization_members (organization_id, user_id, role_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (organization_id, user_id) DO UPDATE SET role_id = EXCLUDED.role_id
     RETURNING id, organization_id, user_id, role_id, created_at,
       (SELECT name FROM users WHERE id = $2) AS user_name,
       (SELECT email FROM users WHERE id = $2) AS user_email`,
    [organizationId, userId, roleId],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Organisationsmitgliedschaft konnte nicht gespeichert werden");
  }
  return mapMemberRow(row);
}

export async function removeOrganizationMember(organizationId: string, userId: string): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM organization_members WHERE organization_id = $1 AND user_id = $2`, [organizationId, userId]);
  return (rowCount ?? 0) > 0;
}
