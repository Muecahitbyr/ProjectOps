import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  pauseClusterAgent,
  registerClusterAgent,
  removeClusterAgent,
  resumeClusterAgent,
  revokeClusterAgent,
  rotateClusterAgentSecret,
  updateClusterAgent,
  type RegisterAgentInput,
  type UpdateAgentInput,
} from "../api/cluster-agents.api";
import { queryKeys } from "./queryKeys";

// Phase 14 Teil 1-3 - alle Agent-Lifecycle-Mutationen invalidieren sowohl
// die Phase-13-Agentenliste (queryKeys.monitoringAgents) als auch die
// Cluster-spezifischen Views (Verteilung/Health/Analytics), da eine
// Aenderung hier beides beeinflusst.
function useInvalidateClusterAgentQueries() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.monitoringAgents });
    void queryClient.invalidateQueries({ queryKey: queryKeys.clusterOverview });
    void queryClient.invalidateQueries({ queryKey: queryKeys.clusterHealth });
    void queryClient.invalidateQueries({ queryKey: queryKeys.clusterDistribution });
    void queryClient.invalidateQueries({ queryKey: queryKeys.clusterAnalytics });
  };
}

export function useRegisterClusterAgent() {
  const invalidate = useInvalidateClusterAgentQueries();
  return useMutation({
    mutationFn: (input: RegisterAgentInput) => registerClusterAgent(input),
    onSuccess: invalidate,
  });
}

export function usePauseClusterAgent() {
  const invalidate = useInvalidateClusterAgentQueries();
  return useMutation({ mutationFn: (id: string) => pauseClusterAgent(id), onSuccess: invalidate });
}

export function useResumeClusterAgent() {
  const invalidate = useInvalidateClusterAgentQueries();
  return useMutation({ mutationFn: (id: string) => resumeClusterAgent(id), onSuccess: invalidate });
}

export function useRevokeClusterAgent() {
  const invalidate = useInvalidateClusterAgentQueries();
  return useMutation({ mutationFn: (id: string) => revokeClusterAgent(id), onSuccess: invalidate });
}

export function useRotateClusterAgentSecret() {
  const invalidate = useInvalidateClusterAgentQueries();
  return useMutation({ mutationFn: (id: string) => rotateClusterAgentSecret(id), onSuccess: invalidate });
}

export function useRemoveClusterAgent() {
  const invalidate = useInvalidateClusterAgentQueries();
  return useMutation({ mutationFn: (id: string) => removeClusterAgent(id), onSuccess: invalidate });
}

export function useUpdateClusterAgent() {
  const invalidate = useInvalidateClusterAgentQueries();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAgentInput }) => updateClusterAgent(id, input),
    onSuccess: invalidate,
  });
}
