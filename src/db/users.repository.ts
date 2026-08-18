import { pool } from "./pool";
import type { ProjectMember, Role, RoleId, User } from "../types/user.types";

interface UserRow {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

const USER_COLUMNS = `id, name, email, avatar, created_at, updated_at`;

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function mapUserRow(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    avatar: row.avatar,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

export async function listUsers(): Promise<User[]> {
  const { rows } = await pool.query<UserRow>(`SELECT ${USER_COLUMNS} FROM users ORDER BY name`);
  return rows.map(mapUserRow);
}

export async function getUserById(id: string): Promise<User | undefined> {
  const { rows } = await pool.query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id]);
  return rows[0] ? mapUserRow(rows[0]) : undefined;
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const { rows } = await pool.query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE email = $1`, [email]);
  return rows[0] ? mapUserRow(rows[0]) : undefined;
}

export interface CreateUserInput {
  name: string;
  email: string;
  avatar?: string;
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const { rows } = await pool.query<UserRow>(
    `INSERT INTO users (name, email, avatar) VALUES ($1, $2, $3) RETURNING ${USER_COLUMNS}`,
    [input.name, input.email, input.avatar ?? null],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Benutzer konnte nicht angelegt werden");
  }
  return mapUserRow(row);
}

export async function listRoles(): Promise<Role[]> {
  const { rows } = await pool.query<{ id: RoleId; description: string }>(`SELECT id, description FROM roles ORDER BY id`);
  return rows;
}

interface ProjectMemberRow {
  id: number;
  project_id: string;
  user_id: string;
  role_id: RoleId;
  created_at: string | Date;
}

function mapProjectMemberRow(row: ProjectMemberRow): ProjectMember {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    roleId: row.role_id,
    createdAt: toIsoString(row.created_at),
  };
}

export async function getMembersForProject(projectId: string): Promise<Array<ProjectMember & { user: User }>> {
  const { rows } = await pool.query<ProjectMemberRow & UserRow & { member_id: number; member_created_at: string | Date }>(
    `SELECT
       pm.id AS member_id, pm.project_id, pm.user_id, pm.role_id, pm.created_at AS member_created_at,
       u.id, u.name, u.email, u.avatar, u.created_at, u.updated_at
     FROM project_members pm
     JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = $1
     ORDER BY u.name`,
    [projectId],
  );

  return rows.map((row) => ({
    id: row.member_id,
    projectId: row.project_id,
    userId: row.user_id,
    roleId: row.role_id,
    createdAt: toIsoString(row.member_created_at),
    user: mapUserRow(row),
  }));
}

export async function getProjectsForUser(
  userId: string,
): Promise<Array<{ projectId: string; projectName: string; roleId: RoleId }>> {
  const { rows } = await pool.query<{ project_id: string; project_name: string; role_id: RoleId }>(
    `SELECT pm.project_id, p.name AS project_name, pm.role_id
     FROM project_members pm
     JOIN projects p ON p.id = pm.project_id
     WHERE pm.user_id = $1
     ORDER BY p.name`,
    [userId],
  );
  return rows.map((row) => ({ projectId: row.project_id, projectName: row.project_name, roleId: row.role_id }));
}

// Fuer die Berechtigungspruefung bei Alert-Regeln/Wartungsfenstern (Phase 9,
// siehe middleware/require-project-role.ts) - undefined bedeutet "kein
// Mitglied dieses Projekts", nicht "Fehler".
export async function getUserRoleForProject(userId: string, projectId: string): Promise<RoleId | undefined> {
  const { rows } = await pool.query<{ role_id: RoleId }>(
    `SELECT role_id FROM project_members WHERE user_id = $1 AND project_id = $2`,
    [userId, projectId],
  );
  return rows[0]?.role_id;
}

// "Globaler Admin" gibt es als Konzept nicht in project_members (Rollen sind
// stets projektbezogen, siehe Migration 0012) - fuer Aktionen ohne
// Projektkontext (z.B. POST /api/users, Benutzer einladen) gilt daher: wer
// auf MINDESTENS einem Projekt OWNER/ADMIN ist, gilt als global
// verwaltungsberechtigt. Keine neue, erfundene Rollen-Spalte - abgeleitet
// aus echten, bestehenden Mitgliedschaften.
export async function isGlobalAdmin(userId: string): Promise<boolean> {
  const { rows } = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS(
       SELECT 1 FROM project_members WHERE user_id = $1 AND role_id IN ('OWNER', 'ADMIN')
     ) AS exists`,
    [userId],
  );
  return rows[0]?.exists ?? false;
}

export interface AddProjectMemberInput {
  projectId: string;
  userId: string;
  roleId: RoleId;
}

export async function addProjectMember(input: AddProjectMemberInput): Promise<ProjectMember> {
  const { rows } = await pool.query<ProjectMemberRow>(
    `INSERT INTO project_members (project_id, user_id, role_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (project_id, user_id) DO UPDATE SET role_id = EXCLUDED.role_id
     RETURNING id, project_id, user_id, role_id, created_at`,
    [input.projectId, input.userId, input.roleId],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Mitgliedschaft konnte nicht gespeichert werden");
  }
  return mapProjectMemberRow(row);
}

export async function removeProjectMember(projectId: string, userId: string): Promise<boolean> {
  const result = await pool.query(`DELETE FROM project_members WHERE project_id = $1 AND user_id = $2`, [
    projectId,
    userId,
  ]);
  return (result.rowCount ?? 0) > 0;
}
