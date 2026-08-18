import { apiClient } from "./client";
import type { MonitoringAgent } from "../types/monitoring-agent.types";

export async function fetchMonitoringAgents(): Promise<MonitoringAgent[]> {
  const { data } = await apiClient.get<MonitoringAgent[]>("/api/monitoring-agents");
  return data;
}

export async function fetchMonitoringAgent(id: string): Promise<MonitoringAgent> {
  const { data } = await apiClient.get<MonitoringAgent>(`/api/monitoring-agents/${id}`);
  return data;
}
