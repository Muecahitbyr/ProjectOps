import { apiClient } from "./client";
import type { RollingUpdate, RollingUpdateStatus } from "../types/rolling-update.types";

export async function fetchRollingUpdates(agentId?: string, limit = 50): Promise<RollingUpdate[]> {
  const { data } = await apiClient.get<RollingUpdate[]>("/api/cluster/rolling-updates", { params: { agentId, limit } });
  return data;
}

export async function createRollingUpdate(agentId: string, targetVersion: string): Promise<RollingUpdate> {
  const { data } = await apiClient.post<RollingUpdate>("/api/cluster/rolling-updates", { agentId, targetVersion });
  return data;
}

export async function transitionRollingUpdate(id: string, status: RollingUpdateStatus, error?: string): Promise<RollingUpdate> {
  const { data } = await apiClient.post<RollingUpdate>(`/api/cluster/rolling-updates/${id}/transition`, { status, error });
  return data;
}
