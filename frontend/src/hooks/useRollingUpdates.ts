import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createRollingUpdate, fetchRollingUpdates, transitionRollingUpdate } from "../api/rolling-updates.api";
import { queryKeys } from "./queryKeys";
import type { RollingUpdateStatus } from "../types/rolling-update.types";

const ROLLING_UPDATES_REFRESH_MS = 15_000;

export function useRollingUpdates(agentId?: string) {
  return useQuery({
    queryKey: queryKeys.rollingUpdates(agentId),
    queryFn: () => fetchRollingUpdates(agentId),
    refetchInterval: ROLLING_UPDATES_REFRESH_MS,
  });
}

export function useCreateRollingUpdate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, targetVersion }: { agentId: string; targetVersion: string }) => createRollingUpdate(agentId, targetVersion),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["cluster", "rolling-updates"] });
    },
  });
}

export function useTransitionRollingUpdate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, error }: { id: string; status: RollingUpdateStatus; error?: string }) => transitionRollingUpdate(id, status, error),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["cluster", "rolling-updates"] });
    },
  });
}
