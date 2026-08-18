import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createServiceAccount, fetchServiceAccounts, revokeServiceAccount, rotateServiceAccountSecret } from "../api/service-accounts.api";
import { queryKeys } from "./queryKeys";

export function useServiceAccounts(organizationId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.serviceAccounts(organizationId ?? ""),
    queryFn: () => fetchServiceAccounts(organizationId!),
    enabled: Boolean(organizationId),
  });
}

export function useCreateServiceAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ organizationId, name }: { organizationId: string; name: string }) => createServiceAccount(organizationId, name),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.serviceAccounts(variables.organizationId) });
    },
  });
}

export function useRotateServiceAccountSecret(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rotateServiceAccountSecret(id),
    onSuccess: () => {
      if (organizationId) void queryClient.invalidateQueries({ queryKey: queryKeys.serviceAccounts(organizationId) });
    },
  });
}

export function useRevokeServiceAccount(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => revokeServiceAccount(id),
    onSuccess: () => {
      if (organizationId) void queryClient.invalidateQueries({ queryKey: queryKeys.serviceAccounts(organizationId) });
    },
  });
}
