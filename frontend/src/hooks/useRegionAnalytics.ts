import { useQuery } from "@tanstack/react-query";
import { fetchAgentHeartbeatTimeline, fetchAgentPerformance, fetchMaintenanceImpact, fetchRegionAnalytics } from "../api/region-analytics.api";

export function useRegionAnalytics(hours: number) {
  return useQuery({
    queryKey: ["region-analytics", "regions", hours],
    queryFn: () => fetchRegionAnalytics(hours),
  });
}

export function useAgentPerformance(hours: number) {
  return useQuery({
    queryKey: ["region-analytics", "agent-performance", hours],
    queryFn: () => fetchAgentPerformance(hours),
  });
}

export function useAgentHeartbeatTimeline(agentId: string | undefined, hours: number) {
  return useQuery({
    queryKey: ["region-analytics", "heartbeat-timeline", agentId ?? "", hours],
    queryFn: () => fetchAgentHeartbeatTimeline(agentId!, hours),
    enabled: Boolean(agentId),
  });
}

export function useMaintenanceImpact(limit: number) {
  return useQuery({
    queryKey: ["region-analytics", "maintenance-impact", limit],
    queryFn: () => fetchMaintenanceImpact(limit),
  });
}
