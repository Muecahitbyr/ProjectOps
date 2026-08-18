import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createBackup, fetchBackups, restoreBackup } from "../api/backups.api";
import { queryKeys } from "./queryKeys";
import { REFRESH_INTERVAL_BACKUPS_MS } from "../utils/constants";

export function useBackups(enabled = true) {
  return useQuery({
    queryKey: queryKeys.backups,
    queryFn: fetchBackups,
    refetchInterval: REFRESH_INTERVAL_BACKUPS_MS,
    enabled,
  });
}

export function useCreateBackup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (label: string) => createBackup(label),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.backups });
    },
  });
}

export function useRestoreBackup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => restoreBackup(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.backups });
    },
  });
}
