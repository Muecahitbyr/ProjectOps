import { useQuery } from "@tanstack/react-query";
import { fetchBackendHealth } from "../api/health.api";
import { REFRESH_INTERVAL_DASHBOARD_MS } from "../utils/constants";

export function useBackendHealth() {
  return useQuery({
    queryKey: ["backend", "health"],
    queryFn: fetchBackendHealth,
    refetchInterval: REFRESH_INTERVAL_DASHBOARD_MS,
  });
}
