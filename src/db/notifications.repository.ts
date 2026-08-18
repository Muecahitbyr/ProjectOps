import { pool } from "./pool";
import type { NotificationResult } from "../notifications/channel.interface";
import type { NotificationPayload } from "../notifications/notification.types";

export async function recordNotification(
  payload: NotificationPayload,
  result: NotificationResult,
  incidentId?: number,
): Promise<void> {
  await pool.query(
    `INSERT INTO notifications (project_id, check_id, channel, status, message, error, incident_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      payload.projectId,
      payload.checkId,
      result.channel,
      result.status,
      JSON.stringify(payload),
      result.error ?? null,
      incidentId ?? null,
    ],
  );
}
