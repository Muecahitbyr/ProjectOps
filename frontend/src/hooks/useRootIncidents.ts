import { useQuery } from "@tanstack/react-query";
import { fetchRootIncidents } from "../api/root-incidents.api";
import { queryKeys } from "./queryKeys";

// Kein refetchInterval - useRealtime.ts invalidiert bei INCIDENT_CORRELATED.
export function useRootIncidents(limit = 50) {
  return useQuery({
    queryKey: queryKeys.rootIncidents,
    queryFn: () => fetchRootIncidents(limit),
  });
}
