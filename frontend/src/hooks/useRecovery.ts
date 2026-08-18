import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { executeRecoveryAction, fetchRecoveryActions } from "../api/recovery.api";
import { queryKeys } from "./queryKeys";

// Phase 30 "Enterprise Reliability, Automated Recovery & Operational
// Resilience" - bewusst OHNE eigenes refetchInterval, analog zu
// useChangeRisk() (Phase 29): die zugrunde liegenden Signale (Changes/
// Wartungsfenster/Automation-Executions) haben bereits eigene Realtime-
// Events, auf die hooks/useRealtime.ts gezielt mit einer Invalidierung
// dieses Query-Keys reagiert.
export function useIncidentRecoveryActions(incidentId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.incidentRecoveryActions(incidentId ?? ""),
    queryFn: () => fetchRecoveryActions(incidentId as string),
    enabled: Boolean(incidentId),
  });
}

export function useExecuteRecoveryAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ incidentId, ruleId }: { incidentId: string; ruleId: string }) => executeRecoveryAction(incidentId, ruleId),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.incidentRecoveryActions(variables.incidentId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.incidentTimeline(variables.incidentId) });
      void queryClient.invalidateQueries({ queryKey: ["automation-actions"] });
      void queryClient.invalidateQueries({ queryKey: ["automation-executions"] });
    },
  });
}
