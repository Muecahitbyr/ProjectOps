import { createHmac } from "node:crypto";
import { decryptSecret } from "./crypto";
import {
  listDuePendingDeliveries,
  markDeliveryDeadLetter,
  markDeliveryRetry,
  markDeliverySucceeded,
  getWebhookSecretEncrypted,
} from "../db/webhooks.repository";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";
import { logger } from "./logger";

// Phase 15 Teil 7 "Webhooks" - Retry Queue / Dead Letter Queue. Verarbeitet
// faellige Zustellungen bei jedem bestehenden Scheduler-Tick (core/monitor.ts
// ruft processPendingWebhookDeliveries() auf) statt eines eigenen Pollers
// ("keine Polling-Loesungen ausser bereits bestehende Fallbacks").
const MAX_ATTEMPTS = 5;
// Exponentielles Backoff: 30s, 2min, 10min, 30min, 2h - danach DEAD_LETTER.
const BACKOFF_SCHEDULE_MS = [30_000, 120_000, 600_000, 1_800_000, 7_200_000];
const DELIVERY_TIMEOUT_MS = 10_000;
const BATCH_SIZE = 20;

function nextBackoffMs(attemptCount: number): number {
  return BACKOFF_SCHEDULE_MS[Math.min(attemptCount, BACKOFF_SCHEDULE_MS.length - 1)] ?? BACKOFF_SCHEDULE_MS[BACKOFF_SCHEDULE_MS.length - 1]!;
}

async function deliverOne(webhookId: string, deliveryId: number, url: string, eventType: string, payload: unknown, attemptCount: number): Promise<void> {
  const secretEncrypted = await getWebhookSecretEncrypted(webhookId);
  if (!secretEncrypted) {
    await markDeliveryDeadLetter(deliveryId, "Webhook-Secret nicht gefunden (Webhook geloescht?)", null);
    return;
  }

  const secret = decryptSecret(secretEncrypted);
  const body = JSON.stringify({ eventType, payload, deliveredAt: new Date().toISOString() });
  const signature = createHmac("sha256", secret).update(body).digest("hex");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ProjectOps-Event": eventType,
        "X-ProjectOps-Signature": signature,
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.ok) {
      await markDeliverySucceeded(deliveryId, response.status);
      broadcast(createEvent(RealtimeEventType.WEBHOOK_DELIVERED, { webhookId, deliveryId, eventType, responseStatus: response.status }));
      return;
    }

    throw new Error(`HTTP ${response.status}`);
  } catch (err) {
    clearTimeout(timeout);
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
    const responseStatusMatch = /^HTTP (\d+)$/.exec(message);
    const responseStatus = responseStatusMatch ? Number(responseStatusMatch[1]) : null;

    if (attemptCount + 1 >= MAX_ATTEMPTS) {
      await markDeliveryDeadLetter(deliveryId, message, responseStatus);
      broadcast(createEvent(RealtimeEventType.WEBHOOK_FAILED, { webhookId, deliveryId, eventType, error: message }));
      logger.warn("Webhook-Zustellung in Dead Letter Queue verschoben", { webhookId, deliveryId, attemptCount: attemptCount + 1, error: message });
      return;
    }

    const nextAttemptAt = new Date(Date.now() + nextBackoffMs(attemptCount));
    await markDeliveryRetry(deliveryId, message, responseStatus, nextAttemptAt);
  }
}

export async function processPendingWebhookDeliveries(): Promise<void> {
  const due = await listDuePendingDeliveries(BATCH_SIZE);
  for (const item of due) {
    try {
      await deliverOne(item.webhookId, item.delivery.id, item.webhookUrl, item.delivery.eventType, item.payload, item.delivery.attemptCount);
    } catch (err) {
      logger.error("Webhook-Zustellungsverarbeitung fehlgeschlagen", {
        deliveryId: item.delivery.id,
        error: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    }
  }
}
