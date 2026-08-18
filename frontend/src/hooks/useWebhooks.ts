import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createWebhook, deleteWebhook, fetchWebhookDeliveries, fetchWebhooks, setWebhookEnabled } from "../api/webhooks.api";
import { queryKeys } from "./queryKeys";
import type { WebhookEventType } from "../types/webhook.types";

const DELIVERIES_REFRESH_MS = 15_000;

export function useWebhooks(organizationId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.webhooks(organizationId ?? ""),
    queryFn: () => fetchWebhooks(organizationId!),
    enabled: Boolean(organizationId),
  });
}

export function useWebhookDeliveries(webhookId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.webhookDeliveries(webhookId ?? ""),
    queryFn: () => fetchWebhookDeliveries(webhookId!),
    enabled: Boolean(webhookId),
    refetchInterval: DELIVERIES_REFRESH_MS,
  });
}

export function useCreateWebhook() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ organizationId, url, events }: { organizationId: string; url: string; events: WebhookEventType[] }) =>
      createWebhook(organizationId, url, events),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.webhooks(variables.organizationId) });
    },
  });
}

export function useSetWebhookEnabled(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => setWebhookEnabled(id, enabled),
    onSuccess: () => {
      if (organizationId) void queryClient.invalidateQueries({ queryKey: queryKeys.webhooks(organizationId) });
    },
  });
}

export function useDeleteWebhook(organizationId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteWebhook(id),
    onSuccess: () => {
      if (organizationId) void queryClient.invalidateQueries({ queryKey: queryKeys.webhooks(organizationId) });
    },
  });
}
