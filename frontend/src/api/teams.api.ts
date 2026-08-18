import { apiClient } from "./client";
import type { OrganizationRoleId } from "../types/organization.types";
import type { Team, TeamMemberWithUser, TeamNotificationSetting } from "../types/team.types";

export async function fetchTeams(organizationId: string): Promise<Team[]> {
  const { data } = await apiClient.get<Team[]>("/api/teams", { params: { organizationId } });
  return data;
}

export async function createTeam(organizationId: string, name: string, description?: string): Promise<Team> {
  const { data } = await apiClient.post<Team>("/api/teams", { organizationId, name, description });
  return data;
}

export async function deleteTeam(id: string): Promise<void> {
  await apiClient.delete(`/api/teams/${id}`);
}

export async function fetchTeamMembers(teamId: string): Promise<TeamMemberWithUser[]> {
  const { data } = await apiClient.get<TeamMemberWithUser[]>(`/api/teams/${teamId}/members`);
  return data;
}

export async function addTeamMember(teamId: string, userId: string, roleId: OrganizationRoleId): Promise<TeamMemberWithUser> {
  const { data } = await apiClient.post<TeamMemberWithUser>(`/api/teams/${teamId}/members`, { userId, roleId });
  return data;
}

export async function removeTeamMember(teamId: string, userId: string): Promise<void> {
  await apiClient.delete(`/api/teams/${teamId}/members/${userId}`);
}

export async function fetchTeamProjects(teamId: string): Promise<string[]> {
  const { data } = await apiClient.get<string[]>(`/api/teams/${teamId}/projects`);
  return data;
}

export async function addProjectToTeam(teamId: string, projectId: string): Promise<void> {
  await apiClient.post(`/api/teams/${teamId}/projects`, { projectId });
}

export async function removeProjectFromTeam(teamId: string, projectId: string): Promise<void> {
  await apiClient.delete(`/api/teams/${teamId}/projects/${projectId}`);
}

export async function fetchTeamNotificationSettings(teamId: string): Promise<TeamNotificationSetting[]> {
  const { data } = await apiClient.get<TeamNotificationSetting[]>(`/api/teams/${teamId}/notification-settings`);
  return data;
}

export async function upsertTeamNotificationSetting(teamId: string, channelId: string, enabled: boolean): Promise<TeamNotificationSetting> {
  const { data } = await apiClient.put<TeamNotificationSetting>(`/api/teams/${teamId}/notification-settings`, { channelId, enabled });
  return data;
}
