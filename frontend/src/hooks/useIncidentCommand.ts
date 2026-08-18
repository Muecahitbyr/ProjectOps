import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { assignCommandRole, fetchCommandOverview, fetchCommandState, unassignCommandRole, updateChecklistItem } from "../api/incident-command.api";
import { queryKeys } from "./queryKeys";
import type { ChecklistItemKey, ChecklistItemStatus, IncidentCommandRoleType } from "../types/incident-command.types";

export function useIncidentCommandState(incidentId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.incidentCommand(incidentId ?? ""),
    queryFn: () => fetchCommandState(incidentId as string),
    enabled: Boolean(incidentId),
  });
}

// Phase 32 - bewusst OHNE eigenes refetchInterval, analog zu
// useChangeRisk()/useIncidentRecoveryActions()/useIncidentCommunications():
// Realtime-Event INCIDENT_COMMAND_UPDATED invalidiert gezielt.
export function useIncidentCommandOverview(incidentId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.incidentCommandOverview(incidentId ?? ""),
    queryFn: () => fetchCommandOverview(incidentId as string),
    enabled: Boolean(incidentId),
  });
}

function invalidateCommand(queryClient: ReturnType<typeof useQueryClient>, incidentId: string): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.incidentCommand(incidentId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.incidentCommandOverview(incidentId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.incidentTimeline(incidentId) });
}

export function useAssignCommandRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ incidentId, role, userId }: { incidentId: string; role: IncidentCommandRoleType; userId: string }) => assignCommandRole(incidentId, role, userId),
    onSuccess: (_data, variables) => invalidateCommand(queryClient, variables.incidentId),
  });
}

export function useUnassignCommandRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ incidentId, role }: { incidentId: string; role: IncidentCommandRoleType }) => unassignCommandRole(incidentId, role),
    onSuccess: (_data, variables) => invalidateCommand(queryClient, variables.incidentId),
  });
}

export function useUpdateChecklistItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ incidentId, itemKey, status }: { incidentId: string; itemKey: ChecklistItemKey; status: ChecklistItemStatus }) => updateChecklistItem(incidentId, itemKey, status),
    onSuccess: (_data, variables) => invalidateCommand(queryClient, variables.incidentId),
  });
}
