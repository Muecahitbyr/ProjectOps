import { enqueueWebhookDelivery, listEnabledWebhooksForEvent } from "../db/webhooks.repository";
import { logger } from "./logger";
import type { WebhookEventType } from "../types/webhook.types";

// Phase 15 Teil 7 "Webhooks" - wird von bestehenden Ereignisquellen
// aufgerufen (genau dort, wo bereits ein RealtimeEventType desselben Namens
// gebroadcastet wird, siehe core/monitor.ts/alerts/alert-evaluator.ts/
// automation/automation-engine.ts), reiht aber nur eine Zustellung ein
// (asynchrone Verarbeitung ueber den Scheduler-Tick, siehe core/webhook-
// delivery.ts) statt selbst zu versenden - ein langsamer/unerreichbarer
// Webhook-Empfaenger darf das eigentliche Monitoring niemals verzoegern.
// organizationId: siehe Kommentar an listEnabledWebhooksForEvent()
// (db/webhooks.repository.ts) - MUSS fuer jedes organisationsgebundene
// Event mitgegeben werden (Sicherheitsfix Phase 27), bleibt fuer die
// gemeinsame, bewusst nicht mandantengetrennte Ops-Konsole (Incidents/
// Alerts/Automation/Agents/...) unveraendert weg.
export async function dispatchWebhookEvent(eventType: WebhookEventType, payload: unknown, organizationId?: string): Promise<void> {
  try {
    const webhooks = await listEnabledWebhooksForEvent(eventType, organizationId);
    for (const webhook of webhooks) {
      await enqueueWebhookDelivery(webhook.id, eventType, payload);
    }
  } catch (err) {
    logger.error("Webhook-Dispatch fehlgeschlagen", {
      eventType,
      error: err instanceof Error ? err.message : "Unbekannter Fehler",
    });
  }
}
