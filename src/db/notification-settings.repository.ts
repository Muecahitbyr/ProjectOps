import { pool } from "./pool";
import type {
  NotificationChannel,
  NotificationChannelId,
  UpsertNotificationSettingInput,
  UserNotificationSetting,
} from "../types/notification-settings.types";

interface SettingRow {
  id: number;
  user_id: string;
  channel_id: NotificationChannelId;
  enabled: boolean;
  quiet_hours_start: number | null;
  quiet_hours_end: number | null;
  severity_filter: string[];
  project_filter: string[];
  created_at: string | Date;
  updated_at: string | Date;
}

const SETTING_COLUMNS = `
  id, user_id, channel_id, enabled, quiet_hours_start, quiet_hours_end,
  severity_filter, project_filter, created_at, updated_at
`;

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function mapRow(row: SettingRow): UserNotificationSetting {
  return {
    id: row.id,
    userId: row.user_id,
    channelId: row.channel_id,
    enabled: row.enabled,
    quietHoursStart: row.quiet_hours_start,
    quietHoursEnd: row.quiet_hours_end,
    severityFilter: row.severity_filter,
    projectFilter: row.project_filter,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

// enabledUserCount ist eine echte, abgeleitete Kennzahl (fuer das
// Dashboard-Widget "Benachrichtigungskanaele") - keine neue Datenquelle,
// nur eine Aggregation ueber die bereits bestehende Tabelle.
export async function listNotificationChannels(): Promise<NotificationChannel[]> {
  const { rows } = await pool.query<{ id: NotificationChannelId; description: string; enabled_count: string }>(
    `SELECT nc.id, nc.description, COUNT(uns.id) FILTER (WHERE uns.enabled = true) AS enabled_count
     FROM notification_channels nc
     LEFT JOIN user_notification_settings uns ON uns.channel_id = nc.id
     GROUP BY nc.id, nc.description
     ORDER BY nc.id`,
  );
  return rows.map((row) => ({ id: row.id, description: row.description, enabledUserCount: Number(row.enabled_count) }));
}

// Phase 13 Teil 8 "Backup Center" - alle Einstellungen aller Nutzer (statt
// pro Nutzer wie getNotificationSettingsForUser oben), fuer den
// System-Backup-Snapshot.
export async function listAllNotificationSettings(): Promise<UserNotificationSetting[]> {
  const { rows } = await pool.query<SettingRow>(
    `SELECT ${SETTING_COLUMNS} FROM user_notification_settings ORDER BY user_id, channel_id`,
  );
  return rows.map(mapRow);
}

export async function getNotificationSettingsForUser(userId: string): Promise<UserNotificationSetting[]> {
  const { rows } = await pool.query<SettingRow>(
    `SELECT ${SETTING_COLUMNS} FROM user_notification_settings WHERE user_id = $1 ORDER BY channel_id`,
    [userId],
  );
  return rows.map(mapRow);
}

// Ein Benutzer hat hoechstens eine Einstellungszeile pro Kanal (UNIQUE
// user_id/channel_id) - upsert statt separatem create/update, da das
// Frontend immer den vollstaendigen Zustand eines Kanal-Schalters sendet.
export async function upsertNotificationSetting(input: UpsertNotificationSettingInput): Promise<UserNotificationSetting> {
  const { rows } = await pool.query<SettingRow>(
    `INSERT INTO user_notification_settings
       (user_id, channel_id, enabled, quiet_hours_start, quiet_hours_end, severity_filter, project_filter)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (user_id, channel_id) DO UPDATE SET
       enabled = EXCLUDED.enabled,
       quiet_hours_start = EXCLUDED.quiet_hours_start,
       quiet_hours_end = EXCLUDED.quiet_hours_end,
       severity_filter = EXCLUDED.severity_filter,
       project_filter = EXCLUDED.project_filter,
       updated_at = now()
     RETURNING ${SETTING_COLUMNS}`,
    [
      input.userId,
      input.channelId,
      input.enabled ?? true,
      input.quietHoursStart ?? null,
      input.quietHoursEnd ?? null,
      input.severityFilter ?? [],
      input.projectFilter ?? [],
    ],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Benachrichtigungseinstellung konnte nicht gespeichert werden");
  }
  return mapRow(row);
}
