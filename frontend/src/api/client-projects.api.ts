import { apiClient } from "./client";
import type { ClientProject, CreateClientProjectInput, UpdateClientProjectInput } from "../types/client-project.types";

export async function fetchClientProjects(): Promise<ClientProject[]> {
  const { data } = await apiClient.get<ClientProject[]>("/api/client-projects");
  return data;
}

export async function createClientProject(input: CreateClientProjectInput): Promise<ClientProject> {
  const { data } = await apiClient.post<ClientProject>("/api/client-projects", input);
  return data;
}

export async function updateClientProject(id: number, input: UpdateClientProjectInput): Promise<ClientProject> {
  const { data } = await apiClient.patch<ClientProject>(`/api/client-projects/${id}`, input);
  return data;
}

export async function deleteClientProject(id: number): Promise<void> {
  await apiClient.delete(`/api/client-projects/${id}`);
}
