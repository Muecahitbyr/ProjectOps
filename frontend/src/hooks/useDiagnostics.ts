import { useQuery } from "@tanstack/react-query";
import { fetchDiagnosticsSnapshot, fetchDisasterRecoveryReport } from "../api/diagnostics.api";
import { queryKeys } from "./queryKeys";
import { REFRESH_INTERVAL_DIAGNOSTICS_MS, REFRESH_INTERVAL_DISASTER_RECOVERY_MS } from "../utils/constants";

export function useDiagnosticsSnapshot() {
  return useQuery({
    queryKey: queryKeys.diagnostics,
    queryFn: fetchDiagnosticsSnapshot,
    refetchInterval: REFRESH_INTERVAL_DIAGNOSTICS_MS,
  });
}

export function useDisasterRecoveryReport() {
  return useQuery({
    queryKey: queryKeys.disasterRecovery,
    queryFn: fetchDisasterRecoveryReport,
    refetchInterval: REFRESH_INTERVAL_DISASTER_RECOVERY_MS,
  });
}
