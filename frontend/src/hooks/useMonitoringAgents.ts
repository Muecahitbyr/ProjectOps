import { useQuery } from "@tanstack/react-query";
import { fetchMonitoringAgent, fetchMonitoringAgents } from "../api/monitoring-agents.api";
import { queryKeys } from "./queryKeys";
import { REFRESH_INTERVAL_AGENTS_MS } from "../utils/constants";

export function useMonitoringAgents() {
  return useQuery({
    queryKey: queryKeys.monitoringAgents,
    queryFn: fetchMonitoringAgents,
    refetchInterval: REFRESH_INTERVAL_AGENTS_MS,
  });
}

export function useMonitoringAgent(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.monitoringAgent(id ?? ""),
    queryFn: () => fetchMonitoringAgent(id!),
    enabled: Boolean(id),
    refetchInterval: REFRESH_INTERVAL_AGENTS_MS,
  });
}
