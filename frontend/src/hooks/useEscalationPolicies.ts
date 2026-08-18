import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createEscalationPolicy,
  deleteEscalationPolicy,
  fetchEscalationPolicies,
  fetchIncidentEscalationStatus,
  replaceEscalationPolicySteps,
  updateEscalationPolicy,
  type CreateEscalationPolicyInput,
  type EscalationStepInput,
  type UpdateEscalationPolicyInput,
} from "../api/escalation-policies.api";
import { queryKeys } from "./queryKeys";

export function useEscalationPolicies(organizationId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.escalationPolicies(organizationId ?? ""),
    queryFn: () => fetchEscalationPolicies(organizationId as string),
    enabled: Boolean(organizationId),
  });
}

export function useIncidentEscalationStatus(incidentId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.incidentEscalation(incidentId ?? ""),
    queryFn: () => fetchIncidentEscalationStatus(incidentId as string),
    enabled: Boolean(incidentId),
  });
}

function invalidatePolicyQueries(queryClient: ReturnType<typeof useQueryClient>, organizationId?: string) {
  if (organizationId) void queryClient.invalidateQueries({ queryKey: queryKeys.escalationPolicies(organizationId) });
  void queryClient.invalidateQueries({ queryKey: ["escalation-policies"] });
}

export function useCreateEscalationPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEscalationPolicyInput) => createEscalationPolicy(input),
    onSuccess: (data) => invalidatePolicyQueries(queryClient, data.organizationId),
  });
}

export function useUpdateEscalationPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateEscalationPolicyInput }) => updateEscalationPolicy(id, input),
    onSuccess: (data) => invalidatePolicyQueries(queryClient, data.organizationId),
  });
}

export function useDeleteEscalationPolicy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: number; organizationId: string }) => deleteEscalationPolicy(id),
    onSuccess: (_data, variables) => invalidatePolicyQueries(queryClient, variables.organizationId),
  });
}

export function useReplaceEscalationPolicySteps() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, steps }: { id: number; steps: EscalationStepInput[] }) => replaceEscalationPolicySteps(id, steps),
    onSuccess: (data) => invalidatePolicyQueries(queryClient, data.organizationId),
  });
}
