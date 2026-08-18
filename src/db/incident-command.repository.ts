import { pool } from "./pool";
import type { ChecklistItemKey, ChecklistItemStatus, IncidentCommandRole, IncidentCommandRoleType } from "../types/incident-command.types";

interface RoleRow {
  id: number;
  incident_id: number;
  role: IncidentCommandRoleType;
  user_id: string;
  user_name: string;
  assigned_by: string | null;
  assigned_at: string | Date;
}

function mapRoleRow(row: RoleRow): IncidentCommandRole {
  return {
    id: row.id,
    incidentId: row.incident_id,
    role: row.role,
    userId: row.user_id,
    userName: row.user_name,
    assignedBy: row.assigned_by,
    assignedAt: row.assigned_at instanceof Date ? row.assigned_at.toISOString() : row.assigned_at,
  };
}

export async function listCommandRolesForIncident(incidentId: number): Promise<IncidentCommandRole[]> {
  const { rows } = await pool.query<RoleRow>(
    `SELECT r.id, r.incident_id, r.role, r.user_id, u.name AS user_name, r.assigned_by, r.assigned_at
     FROM incident_command_roles r JOIN users u ON u.id = r.user_id
     WHERE r.incident_id = $1
     ORDER BY r.role`,
    [incidentId],
  );
  return rows.map(mapRoleRow);
}

// Race-Safety (Auftragspunkt 19): ON CONFLICT (incident_id, role) DO UPDATE
// ist die DB-autoritative, serialisierte Zuweisung - zwei parallele
// Requests fuer denselben Rollen-Slot koennen niemals einen inkonsistenten
// Zwischenzustand erzeugen, exakt eine der beiden gewinnt deterministisch.
export async function upsertCommandRole(incidentId: number, role: IncidentCommandRoleType, userId: string, assignedBy: string | undefined): Promise<IncidentCommandRole> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO incident_command_roles (incident_id, role, user_id, assigned_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (incident_id, role) DO UPDATE SET user_id = EXCLUDED.user_id, assigned_by = EXCLUDED.assigned_by, assigned_at = now()
     RETURNING id`,
    [incidentId, role, userId, assignedBy ?? null],
  );
  const id = rows[0]!.id;
  const { rows: joined } = await pool.query<RoleRow>(
    `SELECT r.id, r.incident_id, r.role, r.user_id, u.name AS user_name, r.assigned_by, r.assigned_at
     FROM incident_command_roles r JOIN users u ON u.id = r.user_id WHERE r.id = $1`,
    [id],
  );
  return mapRoleRow(joined[0]!);
}

export async function deleteCommandRole(incidentId: number, role: IncidentCommandRoleType): Promise<boolean> {
  const result = await pool.query(`DELETE FROM incident_command_roles WHERE incident_id = $1 AND role = $2`, [incidentId, role]);
  return (result.rowCount ?? 0) > 0;
}

interface ChecklistRow {
  item_key: ChecklistItemKey;
  status: ChecklistItemStatus;
  updated_by: string | null;
  updated_at: string | Date;
}

export interface ChecklistItemRow {
  key: ChecklistItemKey;
  status: ChecklistItemStatus;
  updatedBy: string | null;
  updatedAt: string;
}

export async function listChecklistRowsForIncident(incidentId: number): Promise<ChecklistItemRow[]> {
  const { rows } = await pool.query<ChecklistRow>(
    `SELECT item_key, status, updated_by, updated_at FROM incident_command_checklist_items WHERE incident_id = $1`,
    [incidentId],
  );
  return rows.map((row) => ({
    key: row.item_key,
    status: row.status,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  }));
}

// Dieselbe race-sichere UPSERT-Strategie wie upsertCommandRole() oben.
export async function upsertChecklistItem(incidentId: number, itemKey: ChecklistItemKey, status: ChecklistItemStatus, updatedBy: string | undefined): Promise<ChecklistItemRow> {
  const { rows } = await pool.query<ChecklistRow>(
    `INSERT INTO incident_command_checklist_items (incident_id, item_key, status, updated_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (incident_id, item_key) DO UPDATE SET status = EXCLUDED.status, updated_by = EXCLUDED.updated_by, updated_at = now()
     RETURNING item_key, status, updated_by, updated_at`,
    [incidentId, itemKey, status, updatedBy ?? null],
  );
  const row = rows[0]!;
  return { key: row.item_key, status: row.status, updatedBy: row.updated_by, updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at };
}

// Fuer "letzter Command-Update-Zeitpunkt" (Auftragspunkt 1) - abgeleitet,
// nicht separat gespeichert (dasselbe Prinzip wie MaintenanceWindow.active
// oder CurrentOnCall - siehe core/on-call.ts).
export async function getLastCommandUpdateAt(incidentId: number): Promise<string | null> {
  const { rows } = await pool.query<{ last_at: string | Date | null }>(
    `SELECT GREATEST(
       (SELECT MAX(assigned_at) FROM incident_command_roles WHERE incident_id = $1),
       (SELECT MAX(updated_at) FROM incident_command_checklist_items WHERE incident_id = $1)
     ) AS last_at`,
    [incidentId],
  );
  const value = rows[0]?.last_at;
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}
