import { useQuery } from "@tanstack/react-query";
import { fetchAlertEvents } from "../api/alert-events.api";
import { queryKeys } from "./queryKeys";
import type { AlertEventQuery } from "../types/alert.types";

// Kein refetchInterval - wird ueber useRealtime.ts per WebSocket invalidiert
// (ALERT_TRIGGERED/ALERT_ESCALATED/ALERT_SUPPRESSED/ALERT_UPDATED).
export function useAlertEvents(query: AlertEventQuery = {}) {
  return useQuery({
    queryKey: queryKeys.alertEvents(query),
    queryFn: () => fetchAlertEvents(query),
  });
}
