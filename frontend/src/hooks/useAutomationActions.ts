import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  executeAutomationAction,
  fetchAutomationActions,
  fetchExecutionsForAction,
  updateAutomationActionStatus,
} from "../api/automation-actions.api";
import { queryKeys } from "./queryKeys";
import type { AutomationActionStatus } from "../types/automation.types";

export function useAutomationActions(projectId?: string, status?: AutomationActionStatus) {
  return useQuery({
    queryKey: queryKeys.automationActions(projectId, status),
    queryFn: () => fetchAutomationActions(projectId, status),
  });
}

export function useExecutionsForAction(actionId: string) {
  return useQuery({
    queryKey: queryKeys.automationActionExecutions(actionId),
    queryFn: () => fetchExecutionsForAction(actionId),
    enabled: actionId.length > 0,
  });
}

export function useUpdateAutomationActionStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: AutomationActionStatus }) => updateAutomationActionStatus(id, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["automation-actions"] });
    },
  });
}

export function useExecuteAutomationAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dryRun }: { id: string; dryRun?: boolean }) => executeAutomationAction(id, dryRun),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["automation-actions"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.automationActionExecutions(variables.id) });
      void queryClient.invalidateQueries({ queryKey: ["automation-executions"] });
      void queryClient.invalidateQueries({ queryKey: ["automation-analytics"] });
    },
  });
}
