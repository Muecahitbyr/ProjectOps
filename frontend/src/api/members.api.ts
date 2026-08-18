import { apiClient } from "./client";
import type { ProjectMember, RoleId } from "../types/user.types";

export async function fetchProjectMembers(projectId: string): Promise<ProjectMember[]> {
  const { data } = await apiClient.get<ProjectMember[]>(`/api/projects/${projectId}/members`);
  return data;
}

export async function addProjectMember(projectId: string, userId: string, roleId: RoleId): Promise<ProjectMember> {
  const { data } = await apiClient.post<ProjectMember>(`/api/projects/${projectId}/members`, { userId, roleId });
  return data;
}

export async function removeProjectMember(projectId: string, userId: string): Promise<void> {
  await apiClient.delete(`/api/projects/${projectId}/members/${userId}`);
}
