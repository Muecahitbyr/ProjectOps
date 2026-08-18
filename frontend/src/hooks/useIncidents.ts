import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  acknowledgeIncident,
  assignIncident,
  commentOnIncident,
  fetchIncident,
  fetchIncidents,
  fetchIncidentTimeline,
  reopenIncident,
  resolveIncident,
  type IncidentsQuery,
} from "../api/incidents.api";
import { queryKeys } from "./queryKeys";
import { REFRESH_INTERVAL_INCIDENTS_MS } from "../utils/constants";

export function useIncidents(query: IncidentsQuery = {}) {
  return useQuery({
    queryKey: queryKeys.incidents(query),
    queryFn: () => fetchIncidents(query),
    refetchInterval: REFRESH_INTERVAL_INCIDENTS_MS,
  });
}

// Phase 21 "Enterprise Alerting, Incident Response & Notification
// Orchestration" Auftragspunkt 13 "Incident Detail Page".
export function useIncident(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.incident(id ?? ""),
    queryFn: () => fetchIncident(id as string),
    enabled: Boolean(id),
  });
}

export function useIncidentTimeline(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.incidentTimeline(id ?? ""),
    queryFn: () => fetchIncidentTimeline(id as string),
    enabled: Boolean(id),
  });
}

// Realtime-Events (useRealtime.ts) invalidieren dieselben Query-Keys, daher
// genuegt hier jeweils ein direktes invalidate ohne zusaetzliche Logik -
// konsistent mit dem Rest der Anwendung.
function useIncidentMutation(mutationFn: (id: string) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.incident(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.incidentTimeline(id) });
      void queryClient.invalidateQueries({ queryKey: ["incidents"] });
    },
  });
}

export function useAcknowledgeIncident() {
  return useIncidentMutation(acknowledgeIncident);
}

export function useReopenIncident() {
  return useIncidentMutation(reopenIncident);
}

export function useResolveIncident() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => resolveIncident(id, reason),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.incident(variables.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.incidentTimeline(variables.id) });
      void queryClient.invalidateQueries({ queryKey: ["incidents"] });
    },
  });
}

export function useAssignIncident() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, assigneeId }: { id: string; assigneeId: string | null }) => assignIncident(id, assigneeId),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.incident(variables.id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.incidentTimeline(variables.id) });
    },
  });
}

export function useCommentOnIncident() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, message }: { id: string; message: string }) => commentOnIncident(id, message),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.incidentTimeline(variables.id) });
    },
  });
}
