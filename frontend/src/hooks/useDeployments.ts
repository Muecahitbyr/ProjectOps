import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createDeployment,
  deleteDeployment,
  fetchDeployments,
  fetchRecentDeploymentsForIncident,
  type CreateDeploymentInput,
  type DeploymentsQuery,
} from "../api/deployments.api";
import { queryKeys } from "./queryKeys";

export function useDeployments(projectId: string | undefined, query: DeploymentsQuery = {}) {
  return useQuery({
    queryKey: queryKeys.deployments(projectId ?? "", query),
    queryFn: () => fetchDeployments(projectId as string, query),
    enabled: Boolean(projectId),
  });
}

export function useRecentDeploymentsForIncident(incidentId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.incidentRecentDeployments(incidentId ?? ""),
    queryFn: () => fetchRecentDeploymentsForIncident(incidentId as string),
    enabled: Boolean(incidentId),
  });
}

export function useCreateDeployment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, input }: { projectId: string; input: CreateDeploymentInput }) =>
      createDeployment(projectId, input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["projects", variables.projectId, "deployments"] });
    },
  });
}

export function useDeleteDeployment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: number; projectId: string }) => deleteDeployment(id),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["projects", variables.projectId, "deployments"] });
    },
  });
}
