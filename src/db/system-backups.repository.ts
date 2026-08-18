import { pool } from "./pool";
import type { SystemBackup, SystemBackupData } from "../types/backup.types";

interface SystemBackupRow {
  id: number;
  created_by: string | null;
  label: string;
  data: SystemBackupData;
  restored_at: string | Date | null;
  restored_by: string | null;
  created_at: string | Date;
}

const COLUMNS = `id, created_by, label, data, restored_at, restored_by, created_at`;

function toIsoOrNull(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function mapRow(row: SystemBackupRow): SystemBackup {
  return {
    id: row.id,
    createdBy: row.created_by,
    label: row.label,
    data: row.data,
    restoredAt: toIsoOrNull(row.restored_at),
    restoredBy: row.restored_by,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

export interface CreateSystemBackupInput {
  createdBy?: string;
  label: string;
  data: SystemBackupData;
}

export async function createSystemBackup(input: CreateSystemBackupInput): Promise<SystemBackup> {
  const { rows } = await pool.query<SystemBackupRow>(
    `INSERT INTO system_backups (created_by, label, data) VALUES ($1, $2, $3) RETURNING ${COLUMNS}`,
    [input.createdBy ?? null, input.label, JSON.stringify(input.data)],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Backup konnte nicht gespeichert werden");
  }
  return mapRow(row);
}

export async function listSystemBackups(limit = 50): Promise<SystemBackup[]> {
  const { rows } = await pool.query<SystemBackupRow>(
    `SELECT ${COLUMNS} FROM system_backups ORDER BY created_at DESC LIMIT $1`,
    [limit],
  );
  return rows.map(mapRow);
}

export async function getSystemBackupById(id: number): Promise<SystemBackup | undefined> {
  const { rows } = await pool.query<SystemBackupRow>(`SELECT ${COLUMNS} FROM system_backups WHERE id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function markSystemBackupRestored(id: number, restoredBy: string): Promise<SystemBackup | undefined> {
  const { rows } = await pool.query<SystemBackupRow>(
    `UPDATE system_backups SET restored_at = now(), restored_by = $2 WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, restoredBy],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}
