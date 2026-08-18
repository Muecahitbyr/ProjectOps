import { pool } from "./pool";
import type { CreateWebhookInput, Webhook, WebhookDelivery, WebhookDeliveryStatus, WebhookEventType } from "../types/webhook.types";

interface WebhookRow {
  id: string;
  organization_id: string;
  url: string;
  events: WebhookEventType[];
  enabled: boolean;
  created_by: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

function mapRow(row: WebhookRow): Webhook {
  return {
    id: row.id,
    organizationId: row.organization_id,
    url: row.url,
    events: row.events,
    enabled: row.enabled,
    createdBy: row.created_by,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

const COLUMNS = `id, organization_id, url, events, enabled, created_by, created_at, updated_at`;

export async function listWebhooks(organizationId?: string): Promise<Webhook[]> {
  const values: unknown[] = [];
  const where = organizationId ? (values.push(organizationId), `WHERE organization_id = $1`) : "";
  const { rows } = await pool.query<WebhookRow>(`SELECT ${COLUMNS} FROM webhooks ${where} ORDER BY created_at DESC`, values);
  return rows.map(mapRow);
}

export async function getWebhookById(id: string): Promise<Webhook | undefined> {
  const { rows } = await pool.query<WebhookRow>(`SELECT ${COLUMNS} FROM webhooks WHERE id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : undefined;
}

// Fuer die tatsaechliche Zustellung wird das entschluesselte Secret
// gebraucht (core/webhook-delivery.ts) - eigene Funktion statt es im
// normalen mapRow()/COLUMNS-Pfad mitzufuehren, damit es nirgendwo
// versehentlich in eine API-Antwort gelangt.
export async function getWebhookSecretEncrypted(id: string): Promise<string | undefined> {
  const { rows } = await pool.query<{ secret_encrypted: string }>(`SELECT secret_encrypted FROM webhooks WHERE id = $1`, [id]);
  return rows[0]?.secret_encrypted;
}

// Alle aktiven Webhooks, die einen bestimmten Event-Typ abonniert haben -
// fuer den Dispatch bei einem echten internen Ereignis (core/webhook-
// dispatch.ts).
// Phase 27 "Enterprise Deployment Tracking & Change Correlation" -
// Sicherheitsfix (live gefundene, echte Cross-Tenant-Luecke, siehe
// Abschlussbericht "Gefundene echte Bugs"): organizationId ist optional,
// weil zwei fundamental verschiedene Event-Kategorien ueber denselben
// dispatchWebhookEvent()-Pfad laufen (core/webhook-dispatch.ts) - die
// GEMEINSAME Ops-Konsole (INCIDENT_*/ALERT_*/AUTOMATION_*/AGENT_*/...,
// bewusst NICHT mandantengetrennt, siehe Architekturentscheidung Phase 21)
// uebergibt weiterhin keine organizationId und erreicht wie bisher ALLE
// Webhooks. Echte, organisationsgebundene Events (API_KEY_*, API_QUOTA_*,
// API_USAGE_*, DEPLOYMENT_CREATED) MUESSEN dagegen organizationId
// mitgeben - ohne den Filter unten erhielt bisher JEDE Organisation mit
// einem fuer diesen Event-Typ aktivierten Webhook z.B. auch fremde
// API-Key-Metadaten (organizationId/description/scopes/teamId) jeder
// ANDEREN Organisation.
export async function listEnabledWebhooksForEvent(eventType: WebhookEventType, organizationId?: string): Promise<Webhook[]> {
  const { rows } = await pool.query<WebhookRow>(
    organizationId
      ? `SELECT ${COLUMNS} FROM webhooks WHERE enabled = true AND $1 = ANY(events) AND organization_id = $2`
      : `SELECT ${COLUMNS} FROM webhooks WHERE enabled = true AND $1 = ANY(events)`,
    organizationId ? [eventType, organizationId] : [eventType],
  );
  return rows.map(mapRow);
}

export async function createWebhook(input: CreateWebhookInput, secretEncrypted: string): Promise<Webhook> {
  const { rows } = await pool.query<WebhookRow>(
    `INSERT INTO webhooks (organization_id, url, secret_encrypted, events, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${COLUMNS}`,
    [input.organizationId, input.url, secretEncrypted, input.events, input.createdBy ?? null],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Webhook konnte nicht erstellt werden");
  }
  return mapRow(row);
}

export async function setWebhookEnabled(id: string, enabled: boolean): Promise<Webhook | undefined> {
  const { rows } = await pool.query<WebhookRow>(
    `UPDATE webhooks SET enabled = $2, updated_at = now() WHERE id = $1 RETURNING ${COLUMNS}`,
    [id, enabled],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function deleteWebhook(id: string): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM webhooks WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Webhook Deliveries (Retry Queue / Delivery Logs / Dead Letter Queue)
// ---------------------------------------------------------------------------

interface WebhookDeliveryRow {
  id: number;
  webhook_id: string;
  event_type: string;
  status: WebhookDeliveryStatus;
  attempt_count: number;
  next_attempt_at: string | Date;
  last_error: string | null;
  response_status: number | null;
  delivered_at: string | Date | null;
  created_at: string | Date;
}

function mapDeliveryRow(row: WebhookDeliveryRow): WebhookDelivery {
  return {
    id: row.id,
    webhookId: row.webhook_id,
    eventType: row.event_type,
    status: row.status,
    attemptCount: row.attempt_count,
    nextAttemptAt: row.next_attempt_at instanceof Date ? row.next_attempt_at.toISOString() : row.next_attempt_at,
    lastError: row.last_error,
    responseStatus: row.response_status,
    deliveredAt: row.delivered_at ? (row.delivered_at instanceof Date ? row.delivered_at.toISOString() : row.delivered_at) : null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

const DELIVERY_COLUMNS = `id, webhook_id, event_type, status, attempt_count, next_attempt_at, last_error, response_status, delivered_at, created_at`;

export async function enqueueWebhookDelivery(webhookId: string, eventType: string, payload: unknown): Promise<WebhookDelivery> {
  const { rows } = await pool.query<WebhookDeliveryRow>(
    `INSERT INTO webhook_deliveries (webhook_id, event_type, payload) VALUES ($1, $2, $3) RETURNING ${DELIVERY_COLUMNS}`,
    [webhookId, eventType, JSON.stringify(payload)],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Webhook-Zustellung konnte nicht eingereiht werden");
  }
  return mapDeliveryRow(row);
}

export interface DuePayloadDelivery {
  delivery: WebhookDelivery;
  webhookUrl: string;
  webhookId: string;
  payload: unknown;
}

// Alle faelligen Zustellungen (PENDING, next_attempt_at <= now) - abgerufen
// vom bestehenden Scheduler-Tick (core/monitor.ts), kein eigener Poller.
export async function listDuePendingDeliveries(limit: number): Promise<DuePayloadDelivery[]> {
  const { rows } = await pool.query<WebhookDeliveryRow & { url: string; payload: unknown }>(
    `SELECT wd.id, wd.webhook_id, wd.event_type, wd.status, wd.attempt_count, wd.next_attempt_at,
            wd.last_error, wd.response_status, wd.delivered_at, wd.created_at, wd.payload, w.url
     FROM webhook_deliveries wd
     JOIN webhooks w ON w.id = wd.webhook_id
     WHERE wd.status = 'PENDING' AND wd.next_attempt_at <= now() AND w.enabled = true
     ORDER BY wd.next_attempt_at
     LIMIT $1`,
    [limit],
  );
  return rows.map((row) => ({ delivery: mapDeliveryRow(row), webhookUrl: row.url, webhookId: row.webhook_id, payload: row.payload }));
}

export async function markDeliverySucceeded(id: number, responseStatus: number): Promise<void> {
  await pool.query(
    `UPDATE webhook_deliveries SET status = 'DELIVERED', response_status = $2, delivered_at = now(), attempt_count = attempt_count + 1 WHERE id = $1`,
    [id, responseStatus],
  );
}

export async function markDeliveryRetry(id: number, error: string, responseStatus: number | null, nextAttemptAt: Date): Promise<void> {
  await pool.query(
    `UPDATE webhook_deliveries
     SET status = 'PENDING', attempt_count = attempt_count + 1, last_error = $2, response_status = $3, next_attempt_at = $4
     WHERE id = $1`,
    [id, error, responseStatus, nextAttemptAt.toISOString()],
  );
}

export async function markDeliveryDeadLetter(id: number, error: string, responseStatus: number | null): Promise<void> {
  await pool.query(
    `UPDATE webhook_deliveries SET status = 'DEAD_LETTER', attempt_count = attempt_count + 1, last_error = $2, response_status = $3 WHERE id = $1`,
    [id, error, responseStatus],
  );
}

export async function listDeliveriesForWebhook(webhookId: string, limit: number): Promise<WebhookDelivery[]> {
  const { rows } = await pool.query<WebhookDeliveryRow>(
    `SELECT ${DELIVERY_COLUMNS} FROM webhook_deliveries WHERE webhook_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [webhookId, limit],
  );
  return rows.map(mapDeliveryRow);
}

export async function countDeliveriesByStatus(status: WebhookDeliveryStatus): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(`SELECT COUNT(*) AS count FROM webhook_deliveries WHERE status = $1`, [status]);
  return Number(rows[0]?.count ?? 0);
}
