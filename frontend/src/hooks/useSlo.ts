import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSlo,
  deleteSlo,
  fetchSlo,
  fetchSloHistory,
  fetchSlos,
  updateSlo,
  type CreateSloInput,
  type SlosQuery,
  type UpdateSloInput,
} from "../api/slo.api";
import { queryKeys } from "./queryKeys";
import type { SloHistoryWindow } from "../types/slo.types";

const SLO_REFRESH_MS = 30_000;

export function useSlos(query: SlosQuery = {}, enabled = true) {
  return useQuery({ queryKey: queryKeys.slos(query), queryFn: () => fetchSlos(query), refetchInterval: SLO_REFRESH_MS, enabled });
}

export function useSlo(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.slo(id ?? ""),
    queryFn: () => fetchSlo(id as string),
    enabled: Boolean(id),
    refetchInterval: SLO_REFRESH_MS,
  });
}

export function useSloHistory(id: string | undefined, window: SloHistoryWindow) {
  return useQuery({
    queryKey: queryKeys.sloHistory(id ?? "", window),
    queryFn: () => fetchSloHistory(id as string, window),
    enabled: Boolean(id),
    refetchInterval: SLO_REFRESH_MS,
  });
}

export function useCreateSlo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSloInput) => createSlo(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform", "slo"] });
    },
  });
}

export function useUpdateSlo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateSloInput }) => updateSlo(id, input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.slo(variables.id) });
      void queryClient.invalidateQueries({ queryKey: ["platform", "slo"] });
    },
  });
}

export function useDeleteSlo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSlo(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["platform", "slo"] });
    },
  });
}
