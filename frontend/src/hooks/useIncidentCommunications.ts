import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createIncidentCommunication, fetchIncidentCommunications } from "../api/incident-communications.api";
import { queryKeys } from "./queryKeys";
import type { CreateIncidentCommunicationInput } from "../types/incident-communication.types";

// Phase 31 - bewusst OHNE eigenes refetchInterval, analog zu useChangeRisk()
// (Phase 29) / useIncidentRecoveryActions() (Phase 30): Realtime-Event
// INCIDENT_COMMUNICATION_CREATED invalidiert gezielt (hooks/useRealtime.ts).
export function useIncidentCommunications(incidentId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.incidentCommunications(incidentId ?? ""),
    queryFn: () => fetchIncidentCommunications(incidentId as string),
    enabled: Boolean(incidentId),
  });
}

export function useCreateIncidentCommunication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ incidentId, input }: { incidentId: string; input: CreateIncidentCommunicationInput }) => createIncidentCommunication(incidentId, input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.incidentCommunications(variables.incidentId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.incidentTimeline(variables.incidentId) });
    },
  });
}
