import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAlertRule,
  deleteAlertRule,
  fetchAlertRule,
  fetchAlertRules,
  fetchEscalationSteps,
  replaceEscalationSteps,
  updateAlertRule,
} from "../api/alerts.api";
import { queryKeys } from "./queryKeys";
import { REFRESH_INTERVAL_ALERTS_MS } from "../utils/constants";
import type { CreateAlertRuleInput, CreateEscalationStepInput, UpdateAlertRuleInput } from "../types/alert.types";

export function useAlertRules(projectId?: string) {
  return useQuery({
    queryKey: queryKeys.alerts(projectId),
    queryFn: () => fetchAlertRules(projectId),
    refetchInterval: REFRESH_INTERVAL_ALERTS_MS,
  });
}

export function useAlertRule(id: string) {
  return useQuery({
    queryKey: queryKeys.alert(id),
    queryFn: () => fetchAlertRule(id),
    enabled: id.length > 0,
  });
}

function invalidateAlertLists(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: ["alerts"] });
}

export function useCreateAlertRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAlertRuleInput) => createAlertRule(input),
    onSuccess: () => invalidateAlertLists(queryClient),
  });
}

export function useUpdateAlertRule(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateAlertRuleInput) => updateAlertRule(id, input),
    onSuccess: () => {
      invalidateAlertLists(queryClient);
      void queryClient.invalidateQueries({ queryKey: queryKeys.alert(id) });
    },
  });
}

export function useDeleteAlertRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAlertRule(id),
    onSuccess: () => invalidateAlertLists(queryClient),
  });
}

export function useEscalationSteps(alertRuleId: string) {
  return useQuery({
    queryKey: queryKeys.escalationSteps(alertRuleId),
    queryFn: () => fetchEscalationSteps(alertRuleId),
    enabled: alertRuleId.length > 0,
  });
}

export function useReplaceEscalationSteps(alertRuleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (steps: CreateEscalationStepInput[]) => replaceEscalationSteps(alertRuleId, steps),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.escalationSteps(alertRuleId) });
    },
  });
}
