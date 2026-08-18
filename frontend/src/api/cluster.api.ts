import { apiClient } from "./client";
import type { AgentDistributionEntry, ClusterAnalytics, ClusterHealthReport, ClusterOverview, DistributionStrategy, FailoverHistoryEntry } from "../types/cluster.types";
import type { AgentLogEntry, AgentLogLevel } from "../types/agent-log.types";
import type { ClusterEvent, ClusterEventType } from "../types/cluster-event.types";

export async function fetchClusterOverview(): Promise<ClusterOverview> {
  const { data } = await apiClient.get<ClusterOverview>("/api/cluster");
  return data;
}

export async function fetchClusterHealth(): Promise<ClusterHealthReport> {
  const { data } = await apiClient.get<ClusterHealthReport>("/api/cluster/health");
  return data;
}

export async function fetchClusterDistribution(): Promise<AgentDistributionEntry[]> {
  const { data } = await apiClient.get<AgentDistributionEntry[]>("/api/cluster/distribution");
  return data;
}

export async function fetchClusterAnalytics(): Promise<ClusterAnalytics> {
  const { data } = await apiClient.get<ClusterAnalytics>("/api/cluster/analytics");
  return data;
}

export async function fetchFailoverHistory(limit = 20): Promise<FailoverHistoryEntry[]> {
  const { data } = await apiClient.get<FailoverHistoryEntry[]>("/api/cluster/failover", { params: { limit } });
  return data;
}

export async function fetchClusterStrategies(): Promise<{ current: DistributionStrategy; available: DistributionStrategy[] }> {
  const { data } = await apiClient.get<{ current: DistributionStrategy; available: DistributionStrategy[] }>("/api/cluster/strategies");
  return data;
}

export interface AgentLogQuery {
  agentId?: string;
  projectId?: string;
  checkId?: string;
  level?: AgentLogLevel;
  limit?: number;
}

export async function fetchAgentLogs(query: AgentLogQuery): Promise<AgentLogEntry[]> {
  const { data } = await apiClient.get<AgentLogEntry[]>("/api/cluster/logs", { params: query });
  return data;
}

export interface ClusterEventQuery {
  eventType?: ClusterEventType;
  agentId?: string;
  limit?: number;
}

export async function fetchClusterEvents(query: ClusterEventQuery): Promise<ClusterEvent[]> {
  const { data } = await apiClient.get<ClusterEvent[]>("/api/cluster/events", { params: query });
  return data;
}
