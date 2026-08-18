import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createMaintenanceWindow, deleteMaintenanceWindow, fetchMaintenanceWindows } from "../api/maintenance.api";
import { queryKeys } from "./queryKeys";
import { REFRESH_INTERVAL_MAINTENANCE_MS } from "../utils/constants";
import type { CreateMaintenanceWindowInput } from "../types/maintenance.types";

export function useMaintenanceWindows(projectId?: string) {
  return useQuery({
    queryKey: queryKeys.maintenanceWindows(projectId),
    queryFn: () => fetchMaintenanceWindows(projectId),
    // "active" haengt von now() ab, aendert sich also auch ohne Server-Event
    // (ein Fenster kann rein durch Zeitablauf inaktiv werden) - anders als
    // sonst auf dieser Seite bewusst mit kurzem Polling statt rein
    // Realtime-getrieben.
    refetchInterval: REFRESH_INTERVAL_MAINTENANCE_MS,
  });
}

export function useCreateMaintenanceWindow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMaintenanceWindowInput) => createMaintenanceWindow(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["maintenance"] });
    },
  });
}

export function useDeleteMaintenanceWindow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteMaintenanceWindow(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["maintenance"] });
    },
  });
}
