import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClientProject, deleteClientProject, fetchClientProjects, updateClientProject } from "../api/client-projects.api";
import { queryKeys } from "./queryKeys";
import type { CreateClientProjectInput, UpdateClientProjectInput } from "../types/client-project.types";

export function useClientProjects() {
  return useQuery({
    queryKey: queryKeys.clientProjects,
    queryFn: fetchClientProjects,
  });
}

export function useCreateClientProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateClientProjectInput) => createClientProject(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["client-projects"] });
    },
  });
}

export function useUpdateClientProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateClientProjectInput }) => updateClientProject(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["client-projects"] });
    },
  });
}

export function useDeleteClientProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteClientProject(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["client-projects"] });
    },
  });
}
