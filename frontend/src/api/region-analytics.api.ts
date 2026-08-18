import { apiClient } from "./client";
import type { AgentHeartbeatBucket, AgentPerformanceEntry, MaintenanceImpactEntry, RegionAnalyticsEntry } from "../types/region-analytics.types";

export async function fetchRegionAnalytics(hours: number): Promise<RegionAnalyticsEntry[]> {
  const { data } = await apiClient.get<RegionAnalyticsEntry[]>("/api/region-analytics/regions", { params: { hours } });
  return data;
}

export async function fetchAgentPerformance(hours: number): Promise<AgentPerformanceEntry[]> {
  const { data } = await apiClient.get<AgentPerformanceEntry[]>("/api/region-analytics/agent-performance", { params: { hours } });
  return data;
}

export async function fetchAgentHeartbeatTimeline(agentId: string, hours: number): Promise<AgentHeartbeatBucket[]> {
  const { data } = await apiClient.get<AgentHeartbeatBucket[]>(`/api/region-analytics/agents/${agentId}/heartbeat-timeline`, { params: { hours } });
  return data;
}

export async function fetchMaintenanceImpact(limit: number): Promise<MaintenanceImpactEntry[]> {
  const { data } = await apiClient.get<MaintenanceImpactEntry[]>("/api/region-analytics/maintenance-impact", { params: { limit } });
  return data;
}
