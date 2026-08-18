import { apiClient } from "./client";
import type { CreateWebhookResult, Webhook, WebhookDelivery, WebhookEventType } from "../types/webhook.types";

export async function fetchWebhooks(organizationId: string): Promise<Webhook[]> {
  const { data } = await apiClient.get<Webhook[]>("/api/webhooks", { params: { organizationId } });
  return data;
}

export async function createWebhook(organizationId: string, url: string, events: WebhookEventType[]): Promise<CreateWebhookResult> {
  const { data } = await apiClient.post<CreateWebhookResult>("/api/webhooks", { organizationId, url, events });
  return data;
}

export async function setWebhookEnabled(id: string, enabled: boolean): Promise<Webhook> {
  const { data } = await apiClient.patch<Webhook>(`/api/webhooks/${id}`, { enabled });
  return data;
}

export async function deleteWebhook(id: string): Promise<void> {
  await apiClient.delete(`/api/webhooks/${id}`);
}

export async function fetchWebhookDeliveries(id: string, limit = 50): Promise<WebhookDelivery[]> {
  const { data } = await apiClient.get<WebhookDelivery[]>(`/api/webhooks/${id}/deliveries`, { params: { limit } });
  return data;
}
