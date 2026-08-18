import { pool } from "./pool";
import type { EventChannelResult } from "../notifications/event-channel.interface";
import type { NotificationEvent } from "../notifications/notification-event.types";

export interface NotificationEventRecord {
  id: number;
  eventType: string;
  projectId: string;
  severity: string;
  title: string;
  message: string;
  metadata: Record<string, unknown> | null;
  channel: string;
  status: string;
  error: string | null;
  createdAt: string;
}

interface NotificationEventRow {
  id: number;
  event_type: string;
  project_id: string;
  severity: string;
  title: string;
  message: string;
  metadata: Record<string, unknown> | null;
  channel: string;
  status: string;
  error: string | null;
  created_at: string | Date;
}

function mapRow(row: NotificationEventRow): NotificationEventRecord {
  return {
    id: row.id,
    eventType: row.event_type,
    projectId: row.project_id,
    severity: row.severity,
    title: row.title,
    message: row.message,
    metadata: row.metadata,
    channel: row.channel,
    status: row.status,
    error: row.error,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

export async function recordNotificationEvent(event: NotificationEvent, result: EventChannelResult): Promise<void> {
  await pool.query(
    `INSERT INTO notification_events (event_type, project_id, severity, title, message, metadata, channel, status, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      event.type,
      event.projectId,
      event.severity,
      event.title,
      event.message,
      event.metadata ? JSON.stringify(event.metadata) : null,
      result.channel,
      result.status,
      result.error ?? null,
    ],
  );
}

// Phase 11 Teil 2 (FLUSH_QUEUE): die einzigen Eintraege, die dauerhaft
// PENDING bleiben, sind PUSH-Zustellungen (kein APNs-Anbieter angebunden,
// siehe event-channels/push-event.channel.ts) - das ist die echte
// "Warteschlange", die eine erneute Zustellung versuchen kann, sobald APNs
// eines Tages angebunden ist. Kein Fake-Queue-System, sondern genau diese
// realen, bereits vorhandenen Zeilen.
export async function listPendingNotificationEvents(projectId: string, limit = 100): Promise<NotificationEventRecord[]> {
  const { rows } = await pool.query<NotificationEventRow>(
    `SELECT id, event_type, project_id, severity, title, message, metadata, channel, status, error, created_at
     FROM notification_events
     WHERE project_id = $1 AND status = 'PENDING'
     ORDER BY created_at ASC
     LIMIT $2`,
    [projectId, limit],
  );
  return rows.map(mapRow);
}

export interface ListNotificationEventsFilters {
  projectId?: string;
  channel?: string;
  limit: number;
}

// Phase 21 Auftragspunkt 7/18 "Storm Protection"/"Notification Quotas" -
// notification_events hat keine eigene organization_id-Spalte (nur
// project_id, wie automation_rules/api_keys an anderer Stelle) - Zaehlung
// ueber alle Projekte der Organisation per JOIN, dasselbe etablierte Muster
// wie countAutomationRulesForOrganization() (Phase 18).
export async function countNotificationEventsForProjectOrgSince(organizationId: string, minutes: number): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM notification_events ne
     JOIN projects p ON p.id = ne.project_id
     WHERE p.organization_id = $1 AND ne.created_at >= now() - ($2 || ' minutes')::interval`,
    [organizationId, minutes],
  );
  return Number(rows[0]?.count ?? 0);
}

// Fuer das Notification Center (Frontend): nur IN_APP-Eintraege je Event
// vermeiden Duplikate (derselbe Event wird sonst 1x je Kanal gespeichert -
// EMAIL/PUSH/WEBSOCKET sind Zustellprotokolle, nicht Teil der sichtbaren Liste).
export async function listNotificationEvents(filters: ListNotificationEventsFilters): Promise<NotificationEventRecord[]> {
  const conditions: string[] = [`channel = 'IN_APP'`];
  const params: unknown[] = [];

  if (filters.projectId) {
    params.push(filters.projectId);
    conditions.push(`project_id = $${params.length}`);
  }

  params.push(filters.limit);
  const { rows } = await pool.query<NotificationEventRow>(
    `SELECT id, event_type, project_id, severity, title, message, metadata, channel, status, error, created_at
     FROM notification_events
     WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC
     LIMIT $${params.length}`,
    params,
  );
  return rows.map(mapRow);
}
