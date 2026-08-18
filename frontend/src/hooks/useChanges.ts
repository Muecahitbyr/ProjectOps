import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  approveChange,
  cancelChange,
  completeChange,
  createChange,
  deleteChange,
  failChange,
  fetchChange,
  fetchChangeAudit,
  fetchChangeImpact,
  fetchChangeRisk,
  fetchChangeMaintenanceWindows,
  fetchChangeRelatedIncidents,
  fetchChanges,
  fetchChangesForService,
  fetchIncidentChangeContext,
  fetchRecentChangesForIncident,
  rejectChange,
  replaceChangeServices,
  scheduleChange,
  startChange,
  updateChange,
  type ChangesQuery,
  type CreateChangeInput,
  type UpdateChangeInput,
} from "../api/changes.api";
import { queryKeys } from "./queryKeys";

const CHANGES_REFRESH_MS = 30_000;

export function useChanges(query: ChangesQuery, enabled = true) {
  return useQuery({ queryKey: queryKeys.changes(query), queryFn: () => fetchChanges(query), refetchInterval: CHANGES_REFRESH_MS, enabled });
}

export function useChange(id: number | undefined) {
  return useQuery({
    queryKey: queryKeys.change(id ?? -1),
    queryFn: () => fetchChange(id as number),
    enabled: Boolean(id),
    refetchInterval: CHANGES_REFRESH_MS,
  });
}

export function useChangeImpact(id: number | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.changeImpact(id ?? -1),
    queryFn: () => fetchChangeImpact(id as number),
    enabled: Boolean(id) && enabled,
  });
}

export function useChangeRelatedIncidents(id: number | undefined) {
  return useQuery({
    queryKey: queryKeys.changeRelatedIncidents(id ?? -1),
    queryFn: () => fetchChangeRelatedIncidents(id as number),
    enabled: Boolean(id),
  });
}

export function useChangeMaintenanceWindows(id: number | undefined) {
  return useQuery({
    queryKey: queryKeys.changeMaintenanceWindows(id ?? -1),
    queryFn: () => fetchChangeMaintenanceWindows(id as number),
    enabled: Boolean(id),
  });
}

export function useChangesForService(serviceId: number | undefined) {
  return useQuery({
    queryKey: queryKeys.changesForService(serviceId ?? -1),
    queryFn: () => fetchChangesForService(serviceId as number),
    enabled: Boolean(serviceId),
  });
}

export function useIncidentChangeContext(incidentId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.incidentChangeContext(incidentId ?? ""),
    queryFn: () => fetchIncidentChangeContext(incidentId as string),
    enabled: Boolean(incidentId),
  });
}

export function useChangeAudit(id: number | undefined) {
  return useQuery({
    queryKey: queryKeys.changeAudit(id ?? -1),
    queryFn: () => fetchChangeAudit(id as number),
    enabled: Boolean(id),
  });
}

// Phase 29 "Enterprise Change Intelligence, Risk Correlation & Deployment
// Safety" - bewusst OHNE eigenes refetchInterval (anders als useChange
// oben): die zugrunde liegenden Signale (Incidents/SLOs/Alerts/Changes/
// Deployments/Maintenance) haben bereits eigene Realtime-Events, auf die
// hooks/useRealtime.ts gezielt mit einer Invalidierung dieses Query-Keys
// reagiert - kein zusaetzliches Polling noetig.
export function useChangeRisk(id: number | undefined, enabled = true) {
  return useQuery({
    queryKey: queryKeys.changeRisk(id ?? -1),
    queryFn: () => fetchChangeRisk(id as number),
    enabled: Boolean(id) && enabled,
  });
}

export function useRecentChangesForIncident(incidentId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.incidentRecentChanges(incidentId ?? ""),
    queryFn: () => fetchRecentChangesForIncident(incidentId as string),
    enabled: Boolean(incidentId),
  });
}

export function useCreateChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateChangeInput) => createChange(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["changes"] });
    },
  });
}

export function useUpdateChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateChangeInput }) => updateChange(id, input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.change(variables.id) });
      void queryClient.invalidateQueries({ queryKey: ["changes"] });
    },
  });
}

export function useDeleteChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteChange(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["changes"] });
    },
  });
}

function invalidateChangeLifecycle(queryClient: ReturnType<typeof useQueryClient>, id: number): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.change(id) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.changeAudit(id) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.changeRisk(id) });
  void queryClient.invalidateQueries({ queryKey: ["changes"] });
  void queryClient.invalidateQueries({ queryKey: ["maintenance"] });
}

export function useScheduleChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => scheduleChange(id),
    onSuccess: (_data, id) => invalidateChangeLifecycle(queryClient, id),
  });
}

export function useStartChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => startChange(id),
    onSuccess: (_data, id) => invalidateChangeLifecycle(queryClient, id),
  });
}

export function useCompleteChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => completeChange(id),
    onSuccess: (_data, id) => invalidateChangeLifecycle(queryClient, id),
  });
}

export function useFailChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) => failChange(id, reason),
    onSuccess: (_data, variables) => invalidateChangeLifecycle(queryClient, variables.id),
  });
}

export function useCancelChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) => cancelChange(id, reason),
    onSuccess: (_data, variables) => invalidateChangeLifecycle(queryClient, variables.id),
  });
}

export function useApproveChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => approveChange(id),
    onSuccess: (_data, id) => invalidateChangeLifecycle(queryClient, id),
  });
}

export function useRejectChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) => rejectChange(id, reason),
    onSuccess: (_data, variables) => invalidateChangeLifecycle(queryClient, variables.id),
  });
}

export function useReplaceChangeServices() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, serviceIds }: { id: number; serviceIds: number[] }) => replaceChangeServices(id, serviceIds),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.change(variables.id) });
      void queryClient.invalidateQueries({ queryKey: ["changes"] });
    },
  });
}
