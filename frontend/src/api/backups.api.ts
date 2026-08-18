import { apiClient } from "./client";
import type { RestoreSummary, SystemBackup } from "../types/backup.types";

export async function fetchBackups(): Promise<SystemBackup[]> {
  const { data } = await apiClient.get<SystemBackup[]>("/api/backups");
  return data;
}

export async function fetchBackup(id: string): Promise<SystemBackup> {
  const { data } = await apiClient.get<SystemBackup>(`/api/backups/${id}`);
  return data;
}

export async function createBackup(label: string): Promise<SystemBackup> {
  const { data } = await apiClient.post<SystemBackup>("/api/backups", { label });
  return data;
}

export async function restoreBackup(id: string): Promise<RestoreSummary> {
  const { data } = await apiClient.post<RestoreSummary>(`/api/backups/${id}/restore`);
  return data;
}
