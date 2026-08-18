import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addOrganizationMember,
  createOrganization,
  fetchOrganizationMembers,
  fetchOrganizations,
  removeOrganizationMember,
  updateOrganization,
} from "../api/organizations.api";
import { queryKeys } from "./queryKeys";
import type { CreateOrganizationInput, OrganizationRoleId, UpdateOrganizationInput } from "../types/organization.types";

const ORGANIZATIONS_REFRESH_MS = 30_000;

export function useOrganizations() {
  return useQuery({ queryKey: queryKeys.organizations, queryFn: fetchOrganizations, refetchInterval: ORGANIZATIONS_REFRESH_MS });
}

export function useOrganizationMembers(organizationId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.organizationMembers(organizationId ?? ""),
    queryFn: () => fetchOrganizationMembers(organizationId!),
    enabled: Boolean(organizationId),
  });
}

export function useCreateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOrganizationInput) => createOrganization(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.organizations });
    },
  });
}

export function useUpdateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateOrganizationInput }) => updateOrganization(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.organizations });
    },
  });
}

export function useAddOrganizationMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ organizationId, userId, roleId }: { organizationId: string; userId: string; roleId: OrganizationRoleId }) =>
      addOrganizationMember(organizationId, userId, roleId),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.organizationMembers(variables.organizationId) });
    },
  });
}

export function useRemoveOrganizationMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ organizationId, userId }: { organizationId: string; userId: string }) => removeOrganizationMember(organizationId, userId),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.organizationMembers(variables.organizationId) });
    },
  });
}
