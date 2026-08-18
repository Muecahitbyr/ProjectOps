import { apiClient } from "./client";
import type { Slo, SloEvaluation, SloHistoryWindow, SloWithCurrentStatus, SliType } from "../types/slo.types";

export interface SlosQuery {
  organizationId?: string;
  teamId?: string;
  projectId?: string;
  enabled?: boolean;
}

export async function fetchSlos(query: SlosQuery = {}): Promise<SloWithCurrentStatus[]> {
  const { data } = await apiClient.get<SloWithCurrentStatus[]>("/api/platform/slo", {
    params: { ...query, ...(query.enabled !== undefined ? { enabled: String(query.enabled) } : {}) },
  });
  return data;
}

export async function fetchSlo(id: string): Promise<SloWithCurrentStatus> {
  const { data } = await apiClient.get<SloWithCurrentStatus>(`/api/platform/slo/${id}`);
  return data;
}

export async function fetchSloHistory(id: string, window: SloHistoryWindow): Promise<SloEvaluation[]> {
  const { data } = await apiClient.get<SloEvaluation[]>(`/api/platform/slo/${id}/history`, { params: { window } });
  return data;
}

export interface CreateSloInput {
  organizationId: string;
  teamId?: string;
  projectId?: string;
  checkId?: string;
  name: string;
  description?: string;
  sliType: SliType;
  target: number;
  latencyThresholdMs?: number;
  windowDays?: number;
  enabled?: boolean;
}

export async function createSlo(input: CreateSloInput): Promise<Slo> {
  const { data } = await apiClient.post<Slo>("/api/platform/slo", input);
  return data;
}

export interface UpdateSloInput {
  name?: string;
  description?: string | null;
  target?: number;
  latencyThresholdMs?: number | null;
  windowDays?: number;
  teamId?: string | null;
  enabled?: boolean;
}

export async function updateSlo(id: string, input: UpdateSloInput): Promise<Slo> {
  const { data } = await apiClient.patch<Slo>(`/api/platform/slo/${id}`, input);
  return data;
}

export async function deleteSlo(id: string): Promise<void> {
  await apiClient.delete(`/api/platform/slo/${id}`);
}
