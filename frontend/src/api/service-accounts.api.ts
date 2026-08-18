import { apiClient } from "./client";
import type { CreateServiceAccountResult, ServiceAccount } from "../types/service-account.types";

export async function fetchServiceAccounts(organizationId: string): Promise<ServiceAccount[]> {
  const { data } = await apiClient.get<ServiceAccount[]>("/api/service-accounts", { params: { organizationId } });
  return data;
}

export async function createServiceAccount(organizationId: string, name: string): Promise<CreateServiceAccountResult> {
  const { data } = await apiClient.post<CreateServiceAccountResult>("/api/service-accounts", { organizationId, name });
  return data;
}

export async function rotateServiceAccountSecret(id: string): Promise<CreateServiceAccountResult> {
  const { data } = await apiClient.post<CreateServiceAccountResult>(`/api/service-accounts/${id}/rotate-secret`);
  return data;
}

export async function revokeServiceAccount(id: string): Promise<ServiceAccount> {
  const { data } = await apiClient.post<ServiceAccount>(`/api/service-accounts/${id}/revoke`);
  return data;
}
