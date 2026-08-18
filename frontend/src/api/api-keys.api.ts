import { apiClient } from "./client";
import type { ApiKey, CreateApiKeyInput, CreateApiKeyResult } from "../types/api-key.types";

export async function fetchApiKeys(organizationId: string): Promise<ApiKey[]> {
  const { data } = await apiClient.get<ApiKey[]>("/api/api-keys", { params: { organizationId } });
  return data;
}

export async function createApiKey(input: CreateApiKeyInput): Promise<CreateApiKeyResult> {
  const { data } = await apiClient.post<CreateApiKeyResult>("/api/api-keys", input);
  return data;
}

export async function revokeApiKey(id: string): Promise<ApiKey> {
  const { data } = await apiClient.post<ApiKey>(`/api/api-keys/${id}/revoke`);
  return data;
}

export async function rotateApiKey(id: string): Promise<CreateApiKeyResult> {
  const { data } = await apiClient.post<CreateApiKeyResult>(`/api/api-keys/${id}/rotate`);
  return data;
}
