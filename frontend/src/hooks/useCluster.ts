import { useQuery } from "@tanstack/react-query";
import {
  fetchAgentLogs,
  fetchClusterAnalytics,
  fetchClusterDistribution,
  fetchClusterEvents,
  fetchClusterHealth,
  fetchClusterOverview,
  fetchClusterStrategies,
  fetchFailoverHistory,
  type AgentLogQuery,
  type ClusterEventQuery,
} from "../api/cluster.api";
import { queryKeys } from "./queryKeys";

// Phase 14 - alle Cluster-Daten sind event-getrieben ueber useRealtime.ts
// (AGENT_*, CHECK_REASSIGNED, FAILOVER_*, CLUSTER_UPDATED, ROLLING_UPDATE_*)
// invalidiert; refetchInterval hier ist nur das ueblich Sicherheitsnetz.
const CLUSTER_REFRESH_MS = 30_000;

export function useClusterOverview() {
  return useQuery({ queryKey: queryKeys.clusterOverview, queryFn: fetchClusterOverview, refetchInterval: CLUSTER_REFRESH_MS });
}

export function useClusterHealth() {
  return useQuery({ queryKey: queryKeys.clusterHealth, queryFn: fetchClusterHealth, refetchInterval: CLUSTER_REFRESH_MS });
}

export function useClusterDistribution() {
  return useQuery({ queryKey: queryKeys.clusterDistribution, queryFn: fetchClusterDistribution, refetchInterval: CLUSTER_REFRESH_MS });
}

export function useClusterAnalytics() {
  return useQuery({ queryKey: queryKeys.clusterAnalytics, queryFn: fetchClusterAnalytics, refetchInterval: CLUSTER_REFRESH_MS });
}

export function useFailoverHistory(limit = 20) {
  return useQuery({ queryKey: queryKeys.clusterFailoverHistory(limit), queryFn: () => fetchFailoverHistory(limit), refetchInterval: CLUSTER_REFRESH_MS });
}

export function useClusterStrategies() {
  return useQuery({ queryKey: queryKeys.clusterStrategies, queryFn: fetchClusterStrategies });
}

export function useAgentLogs(query: AgentLogQuery) {
  return useQuery({ queryKey: queryKeys.agentLogs(query), queryFn: () => fetchAgentLogs(query), refetchInterval: CLUSTER_REFRESH_MS });
}

export function useClusterEvents(query: ClusterEventQuery) {
  return useQuery({ queryKey: queryKeys.clusterEvents(query), queryFn: () => fetchClusterEvents(query), refetchInterval: CLUSTER_REFRESH_MS });
}
