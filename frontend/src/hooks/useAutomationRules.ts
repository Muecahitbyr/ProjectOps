import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAutomationRule,
  deleteAutomationRule,
  fetchAutomationRules,
  updateAutomationRule,
} from "../api/automation-rules.api";
import { queryKeys } from "./queryKeys";
import type { CreateAutomationRuleInput, UpdateAutomationRuleInput } from "../types/automation.types";

export function useAutomationRules(projectId?: string) {
  return useQuery({
    queryKey: queryKeys.automationRules(projectId),
    queryFn: () => fetchAutomationRules(projectId),
  });
}

function invalidateRules(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: ["automation-rules"] });
}

export function useCreateAutomationRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAutomationRuleInput) => createAutomationRule(input),
    onSuccess: () => invalidateRules(queryClient),
  });
}

export function useUpdateAutomationRule(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateAutomationRuleInput) => updateAutomationRule(id, input),
    onSuccess: () => invalidateRules(queryClient),
  });
}

export function useDeleteAutomationRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAutomationRule(id),
    onSuccess: () => invalidateRules(queryClient),
  });
}
