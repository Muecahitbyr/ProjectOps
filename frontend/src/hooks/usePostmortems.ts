import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createActionItem,
  createPostmortem,
  deleteActionItem,
  fetchIncidentPostmortem,
  fetchPostmortems,
  publishPostmortem,
  updateActionItem,
  updatePostmortem,
  type CreateActionItemInput,
  type CreatePostmortemInput,
  type PostmortemsQuery,
  type UpdateActionItemInput,
  type UpdatePostmortemInput,
} from "../api/postmortems.api";
import { queryKeys } from "./queryKeys";

export function usePostmortems(query: PostmortemsQuery = {}) {
  return useQuery({
    queryKey: queryKeys.postmortems(query),
    queryFn: () => fetchPostmortems(query),
  });
}

export function useIncidentPostmortem(incidentId: string | undefined, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.incidentPostmortem(incidentId ?? ""),
    queryFn: () => fetchIncidentPostmortem(incidentId as string),
    enabled: Boolean(incidentId) && options.enabled !== false,
    // 404 ist der Normalfall (noch kein Postmortem angelegt) - kein Retry.
    retry: false,
  });
}

// Realtime-Events (useRealtime.ts) invalidieren dieselben Query-Keys,
// konsistent mit useIncidents.ts.
function invalidatePostmortemQueries(queryClient: ReturnType<typeof useQueryClient>, incidentId: string) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.incidentPostmortem(incidentId) });
  void queryClient.invalidateQueries({ queryKey: ["postmortems"] });
}

export function useCreatePostmortem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ incidentId, input }: { incidentId: string; input: CreatePostmortemInput }) =>
      createPostmortem(incidentId, input),
    onSuccess: (_data, variables) => invalidatePostmortemQueries(queryClient, variables.incidentId),
  });
}

export function useUpdatePostmortem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ incidentId, input }: { incidentId: string; input: UpdatePostmortemInput }) =>
      updatePostmortem(incidentId, input),
    onSuccess: (_data, variables) => invalidatePostmortemQueries(queryClient, variables.incidentId),
  });
}

export function usePublishPostmortem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (incidentId: string) => publishPostmortem(incidentId),
    onSuccess: (_data, incidentId) => invalidatePostmortemQueries(queryClient, incidentId),
  });
}

export function useCreateActionItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ incidentId, input }: { incidentId: string; input: CreateActionItemInput }) =>
      createActionItem(incidentId, input),
    onSuccess: (_data, variables) => invalidatePostmortemQueries(queryClient, variables.incidentId),
  });
}

export function useUpdateActionItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ incidentId, itemId, input }: { incidentId: string; itemId: number; input: UpdateActionItemInput }) =>
      updateActionItem(incidentId, itemId, input),
    onSuccess: (_data, variables) => invalidatePostmortemQueries(queryClient, variables.incidentId),
  });
}

export function useDeleteActionItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ incidentId, itemId }: { incidentId: string; itemId: number }) => deleteActionItem(incidentId, itemId),
    onSuccess: (_data, variables) => invalidatePostmortemQueries(queryClient, variables.incidentId),
  });
}
