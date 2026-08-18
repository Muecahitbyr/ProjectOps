import { pool } from "./pool";
import type { CreateTeamInput, Team, TeamMemberWithUser, TeamNotificationSetting, UpdateTeamInput } from "../types/team.types";
import type { OrganizationRoleId } from "../types/organization.types";

interface TeamRow {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

function mapRow(row: TeamRow): Team {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

const COLUMNS = `id, organization_id, name, description, created_at, updated_at`;

export async function listTeams(organizationId?: string): Promise<Team[]> {
  const values: unknown[] = [];
  const where = organizationId ? (values.push(organizationId), `WHERE organization_id = $1`) : "";
  const { rows } = await pool.query<TeamRow>(`SELECT ${COLUMNS} FROM teams ${where} ORDER BY name`, values);
  return rows.map(mapRow);
}

export async function getTeamById(id: string): Promise<Team | undefined> {
  const { rows } = await pool.query<TeamRow>(`SELECT ${COLUMNS} FROM teams WHERE id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function createTeam(input: CreateTeamInput): Promise<Team> {
  const { rows } = await pool.query<TeamRow>(
    `INSERT INTO teams (organization_id, name, description) VALUES ($1, $2, $3) RETURNING ${COLUMNS}`,
    [input.organizationId, input.name, input.description ?? null],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Team konnte nicht erstellt werden");
  }
  return mapRow(row);
}

export async function updateTeam(id: string, input: UpdateTeamInput): Promise<Team | undefined> {
  const { rows } = await pool.query<TeamRow>(
    `UPDATE teams SET name = COALESCE($2, name), description = COALESCE($3, description), updated_at = now()
     WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, input.name ?? null, input.description ?? null],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function deleteTeam(id: string): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM teams WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Team Members
// ---------------------------------------------------------------------------

interface TeamMemberRow {
  id: number;
  team_id: string;
  user_id: string;
  role_id: OrganizationRoleId;
  created_at: string | Date;
  user_name: string;
  user_email: string;
}

function mapMemberRow(row: TeamMemberRow): TeamMemberWithUser {
  return {
    id: row.id,
    teamId: row.team_id,
    userId: row.user_id,
    roleId: row.role_id,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    userName: row.user_name,
    userEmail: row.user_email,
  };
}

export async function listTeamMembers(teamId: string): Promise<TeamMemberWithUser[]> {
  const { rows } = await pool.query<TeamMemberRow>(
    `SELECT tm.id, tm.team_id, tm.user_id, tm.role_id, tm.created_at, u.name AS user_name, u.email AS user_email
     FROM team_members tm JOIN users u ON u.id = tm.user_id
     WHERE tm.team_id = $1 ORDER BY u.name`,
    [teamId],
  );
  return rows.map(mapMemberRow);
}

export async function addTeamMember(teamId: string, userId: string, roleId: OrganizationRoleId): Promise<TeamMemberWithUser> {
  const { rows } = await pool.query<TeamMemberRow>(
    `INSERT INTO team_members (team_id, user_id, role_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (team_id, user_id) DO UPDATE SET role_id = EXCLUDED.role_id
     RETURNING id, team_id, user_id, role_id, created_at,
       (SELECT name FROM users WHERE id = $2) AS user_name,
       (SELECT email FROM users WHERE id = $2) AS user_email`,
    [teamId, userId, roleId],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Team-Mitgliedschaft konnte nicht gespeichert werden");
  }
  return mapMemberRow(row);
}

export async function removeTeamMember(teamId: string, userId: string): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM team_members WHERE team_id = $1 AND user_id = $2`, [teamId, userId]);
  return (rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Project <-> Team Zuordnung
// ---------------------------------------------------------------------------

export async function listProjectIdsForTeam(teamId: string): Promise<string[]> {
  const { rows } = await pool.query<{ project_id: string }>(`SELECT project_id FROM project_teams WHERE team_id = $1`, [teamId]);
  return rows.map((row) => row.project_id);
}

export async function addProjectToTeam(projectId: string, teamId: string): Promise<void> {
  await pool.query(`INSERT INTO project_teams (project_id, team_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [projectId, teamId]);
}

export async function removeProjectFromTeam(projectId: string, teamId: string): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM project_teams WHERE project_id = $1 AND team_id = $2`, [projectId, teamId]);
  return (rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Team Notification Settings
// ---------------------------------------------------------------------------

interface TeamNotificationSettingRow {
  id: number;
  team_id: string;
  channel_id: string;
  enabled: boolean;
  created_at: string | Date;
  updated_at: string | Date;
}

function mapNotificationRow(row: TeamNotificationSettingRow): TeamNotificationSetting {
  return {
    id: row.id,
    teamId: row.team_id,
    channelId: row.channel_id,
    enabled: row.enabled,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

export async function listTeamNotificationSettings(teamId: string): Promise<TeamNotificationSetting[]> {
  const { rows } = await pool.query<TeamNotificationSettingRow>(
    `SELECT id, team_id, channel_id, enabled, created_at, updated_at FROM team_notification_settings WHERE team_id = $1 ORDER BY channel_id`,
    [teamId],
  );
  return rows.map(mapNotificationRow);
}

export async function upsertTeamNotificationSetting(teamId: string, channelId: string, enabled: boolean): Promise<TeamNotificationSetting> {
  const { rows } = await pool.query<TeamNotificationSettingRow>(
    `INSERT INTO team_notification_settings (team_id, channel_id, enabled)
     VALUES ($1, $2, $3)
     ON CONFLICT (team_id, channel_id) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now()
     RETURNING id, team_id, channel_id, enabled, created_at, updated_at`,
    [teamId, channelId, enabled],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Team-Benachrichtigungseinstellung konnte nicht gespeichert werden");
  }
  return mapNotificationRow(row);
}
