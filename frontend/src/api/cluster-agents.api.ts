import { apiClient } from "./client";
import type { MonitoringAgent } from "../types/monitoring-agent.types";

export interface RegisterAgentInput {
  name: string;
  hostname: string;
  agentVersion: string;
  schedulerVersion: string;
  os: string;
  region?: string;
  nodeVersion?: string;
  tags?: string[];
  capabilities?: string[];
  cpuInfo?: string;
  ramMb?: number;
  diskTotalMb?: number;
  dockerVersion?: string;
  tlsFingerprint?: string;
}

export interface RegisterAgentResult {
  agent: MonitoringAgent;
  secret: string;
}

// Phase 14 Teil 1-3 - Registrierung/Verwaltung ist OWNER/ADMIN-only
// (Benutzer-Session, siehe routes/cluster-agents.routes.ts). Der reale
// Agent-Heartbeat selbst (Secret-authentifiziert) hat bewusst KEIN
// Frontend-Gegenstueck - das ist der Kommunikationskanal zwischen einem
// echten Remote-Agent-Prozess und dem Backend, nicht zwischen Browser und
// Backend.
export async function registerClusterAgent(input: RegisterAgentInput): Promise<RegisterAgentResult> {
  const { data } = await apiClient.post<RegisterAgentResult>("/api/cluster/agents/register", input);
  return data;
}

export async function pauseClusterAgent(id: string): Promise<MonitoringAgent> {
  const { data } = await apiClient.post<MonitoringAgent>(`/api/cluster/agents/${id}/pause`);
  return data;
}

export async function resumeClusterAgent(id: string): Promise<MonitoringAgent> {
  const { data } = await apiClient.post<MonitoringAgent>(`/api/cluster/agents/${id}/resume`);
  return data;
}

export async function revokeClusterAgent(id: string): Promise<MonitoringAgent> {
  const { data } = await apiClient.post<MonitoringAgent>(`/api/cluster/agents/${id}/revoke`);
  return data;
}

export async function rotateClusterAgentSecret(id: string): Promise<RegisterAgentResult> {
  const { data } = await apiClient.post<RegisterAgentResult>(`/api/cluster/agents/${id}/rotate-secret`);
  return data;
}

export async function removeClusterAgent(id: string): Promise<void> {
  await apiClient.delete(`/api/cluster/agents/${id}`);
}

export interface UpdateAgentInput {
  name?: string;
  region?: string;
  tags?: string[];
}

export async function updateClusterAgent(id: string, input: UpdateAgentInput): Promise<MonitoringAgent> {
  const { data } = await apiClient.patch<MonitoringAgent>(`/api/cluster/agents/${id}`, input);
  return data;
}
