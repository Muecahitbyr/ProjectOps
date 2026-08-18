import { apiClient } from "./client";
import type { Deployment, DeploymentStatus } from "../types/deployment.types";

export interface DeploymentsQuery {
  environment?: string;
  status?: DeploymentStatus;
  limit?: number;
}

export async function fetchDeployments(projectId: string, query: DeploymentsQuery = {}): Promise<Deployment[]> {
  const { data } = await apiClient.get<Deployment[]>(`/api/projects/${projectId}/deployments`, { params: query });
  return data;
}

export interface CreateDeploymentInput {
  environment?: string;
  version: string;
  status?: DeploymentStatus;
  description?: string;
}

export async function createDeployment(projectId: string, input: CreateDeploymentInput): Promise<Deployment> {
  const { data } = await apiClient.post<Deployment>(`/api/projects/${projectId}/deployments`, input);
  return data;
}

export async function deleteDeployment(id: number): Promise<void> {
  await apiClient.delete(`/api/deployments/${id}`);
}

export interface RecentDeploymentsResponse {
  windowMinutes: number;
  deployments: Deployment[];
}

export async function fetchRecentDeploymentsForIncident(incidentId: string): Promise<RecentDeploymentsResponse> {
  const { data } = await apiClient.get<RecentDeploymentsResponse>(`/api/incidents/${incidentId}/recent-deployments`);
  return data;
}
