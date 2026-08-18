import { pool } from "./pool";
import type { CreateServiceAccountInput, ServiceAccount } from "../types/service-account.types";

interface ServiceAccountRow {
  id: string;
  organization_id: string;
  name: string;
  scopes: string[];
  expires_at: string | Date | null;
  status: ServiceAccount["status"];
  secret_rotated_at: string | Date | null;
  created_by: string | null;
  created_at: string | Date;
}

function toIsoOrNull(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function mapRow(row: ServiceAccountRow): ServiceAccount {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    scopes: row.scopes,
    expiresAt: toIsoOrNull(row.expires_at),
    status: row.status,
    secretRotatedAt: toIsoOrNull(row.secret_rotated_at),
    createdBy: row.created_by,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

const COLUMNS = `id, organization_id, name, scopes, expires_at, status, secret_rotated_at, created_by, created_at`;

// Phase 16 Auftragspunkt 7 "API Quotas" (maxServiceAccounts pro Plan).
export async function countActiveServiceAccounts(organizationId: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM service_accounts WHERE organization_id = $1 AND status = 'ACTIVE'`,
    [organizationId],
  );
  return Number(rows[0]?.count ?? 0);
}

export async function listServiceAccounts(organizationId?: string): Promise<ServiceAccount[]> {
  const values: unknown[] = [];
  const where = organizationId ? (values.push(organizationId), `WHERE organization_id = $1`) : "";
  const { rows } = await pool.query<ServiceAccountRow>(`SELECT ${COLUMNS} FROM service_accounts ${where} ORDER BY created_at DESC`, values);
  return rows.map(mapRow);
}

export async function getServiceAccountById(id: string): Promise<ServiceAccount | undefined> {
  const { rows } = await pool.query<ServiceAccountRow>(`SELECT ${COLUMNS} FROM service_accounts WHERE id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function createServiceAccount(input: CreateServiceAccountInput, secretHash: string): Promise<ServiceAccount> {
  const { rows } = await pool.query<ServiceAccountRow>(
    `INSERT INTO service_accounts (organization_id, name, secret_hash, scopes, expires_at, created_by, secret_rotated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     RETURNING ${COLUMNS}`,
    [input.organizationId, input.name, secretHash, input.scopes ?? [], input.expiresAt ?? null, input.createdBy ?? null],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Service Account konnte nicht erstellt werden");
  }
  return mapRow(row);
}

export async function rotateServiceAccountSecret(id: string, secretHash: string): Promise<ServiceAccount | undefined> {
  const { rows } = await pool.query<ServiceAccountRow>(
    `UPDATE service_accounts SET secret_hash = $2, secret_rotated_at = now() WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, secretHash],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function revokeServiceAccount(id: string): Promise<ServiceAccount | undefined> {
  const { rows } = await pool.query<ServiceAccountRow>(
    `UPDATE service_accounts SET status = 'REVOKED' WHERE id = $1 RETURNING ${COLUMNS}`,
    [id],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function findActiveServiceAccountByHash(secretHash: string): Promise<ServiceAccount | undefined> {
  const { rows } = await pool.query<ServiceAccountRow>(
    `SELECT ${COLUMNS} FROM service_accounts WHERE secret_hash = $1 AND status = 'ACTIVE'`,
    [secretHash],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}
