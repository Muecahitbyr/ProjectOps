import { apiClient } from "./client";
import type { CreateOrganizationInput, Organization, OrganizationMemberWithUser, OrganizationRoleId, UpdateOrganizationInput } from "../types/organization.types";

export async function fetchOrganizations(): Promise<Organization[]> {
  const { data } = await apiClient.get<Organization[]>("/api/organizations");
  return data;
}

export async function createOrganization(input: CreateOrganizationInput): Promise<Organization> {
  const { data } = await apiClient.post<Organization>("/api/organizations", input);
  return data;
}

export async function updateOrganization(id: string, input: UpdateOrganizationInput): Promise<Organization> {
  const { data } = await apiClient.patch<Organization>(`/api/organizations/${id}`, input);
  return data;
}

export async function fetchOrganizationMembers(organizationId: string): Promise<OrganizationMemberWithUser[]> {
  const { data } = await apiClient.get<OrganizationMemberWithUser[]>(`/api/organizations/${organizationId}/members`);
  return data;
}

export async function addOrganizationMember(organizationId: string, userId: string, roleId: OrganizationRoleId): Promise<OrganizationMemberWithUser> {
  const { data } = await apiClient.post<OrganizationMemberWithUser>(`/api/organizations/${organizationId}/members`, { userId, roleId });
  return data;
}

export async function removeOrganizationMember(organizationId: string, userId: string): Promise<void> {
  await apiClient.delete(`/api/organizations/${organizationId}/members/${userId}`);
}
