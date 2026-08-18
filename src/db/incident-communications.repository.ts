import { pool } from "./pool";
import type { CommunicationSeverity, CommunicationTargetType, IncidentCommunication, NotificationChannelId } from "../types/incident-communication.types";

interface CommunicationRow {
  id: number;
  incident_id: number;
  message: string;
  severity: CommunicationSeverity;
  target_type: CommunicationTargetType;
  target_user_id: string | null;
  target_schedule_id: number | null;
  notification_channel_id: NotificationChannelId | null;
  created_by: string | null;
  created_at: string | Date;
}

const COLUMNS = `id, incident_id, message, severity, target_type, target_user_id, target_schedule_id, notification_channel_id, created_by, created_at`;

function mapRow(row: CommunicationRow): IncidentCommunication {
  return {
    id: row.id,
    incidentId: row.incident_id,
    message: row.message,
    severity: row.severity,
    targetType: row.target_type,
    targetUserId: row.target_user_id,
    targetScheduleId: row.target_schedule_id !== null ? Number(row.target_schedule_id) : null,
    notificationChannelId: row.notification_channel_id,
    createdBy: row.created_by,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

export interface CreateIncidentCommunicationInput {
  incidentId: number;
  message: string;
  severity: CommunicationSeverity;
  targetType: CommunicationTargetType;
  targetUserId?: string;
  targetScheduleId?: number;
  notificationChannelId?: NotificationChannelId;
  createdBy?: string;
}

// Auftragspunkt 7 "Deduplication/Idempotency" - dieselbe Rueckgabe-Sentinel-
// Konvention wie db/service-dependencies.repository.ts#createDependencyIfUnderQuota
// und db/automation-executions.repository.ts#createAutomationExecution:
// Fehlercode 23505 (verletzte Unique-Constraint idx_incident_communications_dedup,
// Migration 0054) wird zu "DUPLICATE" statt eines rohen 500.
export async function createIncidentCommunication(input: CreateIncidentCommunicationInput): Promise<IncidentCommunication | "DUPLICATE"> {
  try {
    const { rows } = await pool.query<CommunicationRow>(
      `INSERT INTO incident_communications
         (incident_id, message, severity, target_type, target_user_id, target_schedule_id, notification_channel_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${COLUMNS}`,
      [
        input.incidentId,
        input.message,
        input.severity,
        input.targetType,
        input.targetUserId ?? null,
        input.targetScheduleId ?? null,
        input.notificationChannelId ?? null,
        input.createdBy ?? null,
      ],
    );
    const row = rows[0];
    if (!row) {
      throw new Error("Communication konnte nicht gespeichert werden");
    }
    return mapRow(row);
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code?: string }).code === "23505") {
      return "DUPLICATE";
    }
    throw err;
  }
}

export async function listCommunicationsForIncident(incidentId: number): Promise<IncidentCommunication[]> {
  const { rows } = await pool.query<CommunicationRow>(
    `SELECT ${COLUMNS} FROM incident_communications WHERE incident_id = $1 ORDER BY created_at DESC`,
    [incidentId],
  );
  return rows.map(mapRow);
}

// Auftragspunkt 6 "Communication Safety" - fuer den weichen, zeitbasierten
// Cooldown-Check (anders als die harte DB-Unique-Constraint oben: hier zaehlt
// JEDE Kommunikation an dasselbe Ziel, unabhaengig vom genauen Text).
export async function getLatestCommunicationForTarget(
  incidentId: number,
  targetType: CommunicationTargetType,
  targetUserId: string | null,
  targetScheduleId: number | null,
): Promise<IncidentCommunication | undefined> {
  const { rows } = await pool.query<CommunicationRow>(
    `SELECT ${COLUMNS} FROM incident_communications
     WHERE incident_id = $1 AND target_type = $2
       AND target_user_id IS NOT DISTINCT FROM $3
       AND target_schedule_id IS NOT DISTINCT FROM $4
     ORDER BY created_at DESC LIMIT 1`,
    [incidentId, targetType, targetUserId, targetScheduleId],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

// Auftragspunkt 6 "Rate-Limit" - Gesamtzahl aller Kommunikationen fuer
// diesen Incident in den letzten `windowMinutes` (unabhaengig vom Ziel) -
// schuetzt vor Kommunikations-Spam auf einen einzelnen Incident.
export async function countCommunicationsForIncidentSince(incidentId: number, windowMinutes: number): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM incident_communications
     WHERE incident_id = $1 AND created_at >= now() - ($2 || ' minutes')::interval`,
    [incidentId, windowMinutes],
  );
  return Number(rows[0]?.count ?? 0);
}
