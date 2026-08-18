import { apiClient } from "./client";
import type { ProjectHealthSummary } from "../types/dashboard.types";
import type { ProjectDashboardDetail } from "../types/project.types";

export async function fetchProjectsHealth(): Promise<ProjectHealthSummary[]> {
  const { data } = await apiClient.get<ProjectHealthSummary[]>("/api/dashboard/projects");
  return data;
}

export async function fetchProjectDetail(projectId: string): Promise<ProjectDashboardDetail> {
  const { data } = await apiClient.get<ProjectDashboardDetail>(`/api/dashboard/projects/${projectId}`);
  return data;
}
