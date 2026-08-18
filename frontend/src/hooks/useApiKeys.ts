import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createApiKey, fetchApiKeys, revokeApiKey, rotateApiKey } from "../api/api-keys.api";
import { queryKeys } from "./queryKeys";
import type { CreateApiKeyInput } from "../types/api-key.types";

export function useApiKeys(organizationId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.apiKeys(organizationId ?? ""),
    queryFn: () => fetchApiKeys(organizationId!),
    enabled: Boolean(organizationId),
  });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateApiKeyInput) => createApiKey(input),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys(variables.organizationId) });
    },
  });
}

export function useRevokeApiKey(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => revokeApiKey(id),
    onSuccess: () => {
      if (organizationId) void queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys(organizationId) });
    },
  });
}

export function useRotateApiKey(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rotateApiKey(id),
    onSuccess: () => {
      if (organizationId) void queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys(organizationId) });
    },
  });
}
