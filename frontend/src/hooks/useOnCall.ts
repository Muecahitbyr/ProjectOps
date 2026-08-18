import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createOnCallOverride,
  createOnCallSchedule,
  deleteOnCallOverride,
  deleteOnCallSchedule,
  fetchCurrentOnCall,
  fetchOnCallOverrides,
  fetchOnCallSchedule,
  fetchOnCallScheduleMembers,
  fetchOnCallSchedules,
  fetchOnCallTimeline,
  replaceOnCallScheduleMembers,
  updateOnCallSchedule,
  type CreateOnCallOverrideInput,
  type CreateOnCallScheduleInput,
  type OnCallSchedulesQuery,
  type UpdateOnCallScheduleInput,
} from "../api/on-call.api";
import { queryKeys } from "./queryKeys";

const ON_CALL_REFRESH_MS = 30_000;

export function useOnCallSchedules(query: OnCallSchedulesQuery = {}, enabled = true) {
  return useQuery({ queryKey: queryKeys.onCallSchedules(query), queryFn: () => fetchOnCallSchedules(query), refetchInterval: ON_CALL_REFRESH_MS, enabled });
}

export function useOnCallSchedule(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.onCallSchedule(id ?? ""),
    queryFn: () => fetchOnCallSchedule(id as string),
    enabled: Boolean(id),
    refetchInterval: ON_CALL_REFRESH_MS,
  });
}

export function useOnCallScheduleMembers(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.onCallScheduleMembers(id ?? ""),
    queryFn: () => fetchOnCallScheduleMembers(id as string),
    enabled: Boolean(id),
    refetchInterval: ON_CALL_REFRESH_MS,
  });
}

export function useCurrentOnCall(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.onCallCurrent(id ?? ""),
    queryFn: () => fetchCurrentOnCall(id as string),
    enabled: Boolean(id),
    // Kuerzeres Intervall als die uebrigen On-Call-Queries - "wer ist gerade
    // dran" ist zeitbasiert und kann zwischen zwei normalen 30s-Refreshes
    // tatsaechlich wechseln (Schichtwechsel), ohne dass irgendein Backend-
    // Event das ausloest (siehe core/on-call.ts - bewusst keine
    // Hintergrund-Berechnung/kein Event dafuer).
    refetchInterval: 15_000,
  });
}

export function useOnCallTimeline(id: string | undefined, from?: string, hours?: number) {
  return useQuery({
    queryKey: queryKeys.onCallTimeline(id ?? "", from, hours),
    queryFn: () => fetchOnCallTimeline(id as string, from, hours),
    enabled: Boolean(id),
    refetchInterval: ON_CALL_REFRESH_MS,
  });
}

export function useOnCallOverrides(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.onCallOverrides(id ?? ""),
    queryFn: () => fetchOnCallOverrides(id as string),
    enabled: Boolean(id),
    refetchInterval: ON_CALL_REFRESH_MS,
  });
}

export function useCreateOnCallSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOnCallScheduleInput) => createOnCallSchedule(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["on-call"] });
    },
  });
}

export function useUpdateOnCallSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateOnCallScheduleInput }) => updateOnCallSchedule(id, input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.onCallSchedule(variables.id) });
      void queryClient.invalidateQueries({ queryKey: ["on-call"] });
    },
  });
}

export function useDeleteOnCallSchedule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteOnCallSchedule(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["on-call"] });
    },
  });
}

export function useReplaceOnCallScheduleMembers(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userIds: string[]) => replaceOnCallScheduleMembers(id, userIds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["on-call"] });
    },
  });
}

export function useCreateOnCallOverride(scheduleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOnCallOverrideInput) => createOnCallOverride(scheduleId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["on-call"] });
    },
  });
}

export function useDeleteOnCallOverride(scheduleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (overrideId: string) => deleteOnCallOverride(scheduleId, overrideId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["on-call"] });
    },
  });
}
