import { apiClient } from "./client";
import type { CreateMaintenanceWindowInput, MaintenanceWindow } from "../types/maintenance.types";

export async function fetchMaintenanceWindows(projectId?: string): Promise<MaintenanceWindow[]> {
  const { data } = await apiClient.get<MaintenanceWindow[]>("/api/maintenance", {
    params: projectId ? { projectId } : undefined,
  });
  return data;
}

export async function createMaintenanceWindow(input: CreateMaintenanceWindowInput): Promise<MaintenanceWindow> {
  const { data } = await apiClient.post<MaintenanceWindow>("/api/maintenance", input);
  return data;
}

export async function deleteMaintenanceWindow(id: string): Promise<void> {
  await apiClient.delete(`/api/maintenance/${id}`);
}
