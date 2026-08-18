import { pool } from "./pool";
import type {
  OnCallSchedule,
  OnCallScheduleMemberWithUser,
  OnCallOverride,
  OnCallOverrideWithUser,
  OnCallRotationType,
} from "../types/on-call.types";

interface ScheduleRow {
  id: number;
  organization_id: string;
  team_id: string;
  name: string;
  description: string | null;
  timezone: string;
  rotation_type: string;
  shift_length_hours: number;
  rotation_start: string | Date;
  enabled: boolean;
  created_by: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

const SCHEDULE_COLUMNS = `
  id, organization_id, team_id, name, description, timezone, rotation_type,
  shift_length_hours, rotation_start, enabled, created_by, created_at, updated_at
`;

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function mapScheduleRow(row: ScheduleRow): OnCallSchedule {
  return {
    // Der pg-Treiber liefert BIGSERIAL-Spalten zur Laufzeit als STRING (kein
    // registrierter Typ-Parser fuer OID 20/int8), obwohl ScheduleRow.id als
    // "number" typisiert ist - derselbe, bereits in Phase 23 gefundene und
    // dokumentierte Bug-Klasse (siehe db/services.repository.ts#mapRow).
    // Live im eigenen E2E-Test gefunden: DELETE .../overrides/:overrideId
    // verglich scheduleId (echte Number aus Number(req.params.id)) gegen
    // override.scheduleId (bisher ungeparster String) - "1" !== 1 liess
    // JEDE Loeschung faelschlich mit 404 fehlschlagen. Number() an der
    // Repository-Grenze behebt es an der Quelle statt an jeder Vergleichsstelle.
    id: Number(row.id),
    organizationId: row.organization_id,
    teamId: row.team_id,
    name: row.name,
    description: row.description,
    timezone: row.timezone,
    rotationType: row.rotation_type as OnCallRotationType,
    shiftLengthHours: row.shift_length_hours,
    rotationStart: toIso(row.rotation_start),
    enabled: row.enabled,
    createdBy: row.created_by,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export interface ListSchedulesFilter {
  organizationId?: string;
  teamId?: string;
  enabled?: boolean;
}

export async function listOnCallSchedules(filter: ListSchedulesFilter = {}): Promise<OnCallSchedule[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (filter.organizationId) {
    values.push(filter.organizationId);
    conditions.push(`organization_id = $${values.length}`);
  }
  if (filter.teamId) {
    values.push(filter.teamId);
    conditions.push(`team_id = $${values.length}`);
  }
  if (filter.enabled !== undefined) {
    values.push(filter.enabled);
    conditions.push(`enabled = $${values.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await pool.query<ScheduleRow>(`SELECT ${SCHEDULE_COLUMNS} FROM on_call_schedules ${where} ORDER BY created_at DESC`, values);
  return rows.map(mapScheduleRow);
}

export async function getOnCallScheduleById(id: number): Promise<OnCallSchedule | undefined> {
  const { rows } = await pool.query<ScheduleRow>(`SELECT ${SCHEDULE_COLUMNS} FROM on_call_schedules WHERE id = $1`, [id]);
  return rows[0] ? mapScheduleRow(rows[0]) : undefined;
}

// Fuer authorizePlatformOrOrganizationMembership()/-Role() (middleware/
// authorize.ts), analog zu getSloOrganizationId()/getServiceOrganizationId().
export async function getOnCallScheduleOrganizationId(id: number): Promise<string | undefined> {
  const { rows } = await pool.query<{ organization_id: string }>(`SELECT organization_id FROM on_call_schedules WHERE id = $1`, [id]);
  return rows[0]?.organization_id;
}

export interface CreateOnCallScheduleInput {
  organizationId: string;
  teamId: string;
  name: string;
  description?: string | null;
  timezone?: string;
  rotationType?: OnCallRotationType;
  shiftLengthHours: number;
  rotationStart: string;
  enabled?: boolean;
  createdBy?: string | null;
}

// Race-sichere Quota-Pruefung - dasselbe SELECT...FOR UPDATE-Transaktions-
// muster wie createSloIfUnderQuota()/createServiceIfUnderQuota() (Phase
// 22/23): COUNT + INSERT ohne Sperre waere unter gleichzeitigen Anfragen
// nicht quota-sicher.
export async function createOnCallScheduleIfUnderQuota(input: CreateOnCallScheduleInput, maxSchedules: number): Promise<OnCallSchedule | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT id FROM organizations WHERE id = $1 FOR UPDATE`, [input.organizationId]);
    const { rows: countRows } = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM on_call_schedules WHERE organization_id = $1`,
      [input.organizationId],
    );
    if (Number(countRows[0]?.count ?? 0) >= maxSchedules) {
      await client.query("ROLLBACK");
      return null;
    }

    const { rows } = await client.query<ScheduleRow>(
      `INSERT INTO on_call_schedules
         (organization_id, team_id, name, description, timezone, rotation_type, shift_length_hours, rotation_start, enabled, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING ${SCHEDULE_COLUMNS}`,
      [
        input.organizationId,
        input.teamId,
        input.name,
        input.description ?? null,
        input.timezone ?? "UTC",
        input.rotationType ?? "WEEKLY",
        input.shiftLengthHours,
        input.rotationStart,
        input.enabled ?? true,
        input.createdBy ?? null,
      ],
    );
    await client.query("COMMIT");
    const row = rows[0];
    if (!row) {
      throw new Error("On-Call-Schedule konnte nicht angelegt werden");
    }
    return mapScheduleRow(row);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export interface UpdateOnCallScheduleInput {
  name?: string;
  description?: string | null;
  timezone?: string;
  rotationType?: OnCallRotationType;
  shiftLengthHours?: number;
  rotationStart?: string;
  enabled?: boolean;
}

export async function updateOnCallSchedule(id: number, input: UpdateOnCallScheduleInput): Promise<OnCallSchedule | undefined> {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (input.name !== undefined) {
    values.push(input.name);
    sets.push(`name = $${values.length}`);
  }
  if (input.description !== undefined) {
    values.push(input.description);
    sets.push(`description = $${values.length}`);
  }
  if (input.timezone !== undefined) {
    values.push(input.timezone);
    sets.push(`timezone = $${values.length}`);
  }
  if (input.rotationType !== undefined) {
    values.push(input.rotationType);
    sets.push(`rotation_type = $${values.length}`);
  }
  if (input.shiftLengthHours !== undefined) {
    values.push(input.shiftLengthHours);
    sets.push(`shift_length_hours = $${values.length}`);
  }
  if (input.rotationStart !== undefined) {
    values.push(input.rotationStart);
    sets.push(`rotation_start = $${values.length}`);
  }
  if (input.enabled !== undefined) {
    values.push(input.enabled);
    sets.push(`enabled = $${values.length}`);
  }
  if (sets.length === 0) {
    return getOnCallScheduleById(id);
  }
  sets.push(`updated_at = now()`);
  values.push(id);
  const { rows } = await pool.query<ScheduleRow>(
    `UPDATE on_call_schedules SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING ${SCHEDULE_COLUMNS}`,
    values,
  );
  return rows[0] ? mapScheduleRow(rows[0]) : undefined;
}

export async function deleteOnCallSchedule(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM on_call_schedules WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Schedule Members (geordnete Rotationsliste)
// ---------------------------------------------------------------------------

interface MemberRow {
  id: number;
  schedule_id: number;
  user_id: string;
  position: number;
  created_at: string | Date;
  user_name: string;
  user_email: string;
}

function mapMemberRow(row: MemberRow): OnCallScheduleMemberWithUser {
  return {
    id: Number(row.id),
    scheduleId: Number(row.schedule_id),
    userId: row.user_id,
    position: row.position,
    createdAt: toIso(row.created_at),
    userName: row.user_name,
    userEmail: row.user_email,
  };
}

export async function listOnCallScheduleMembers(scheduleId: number): Promise<OnCallScheduleMemberWithUser[]> {
  const { rows } = await pool.query<MemberRow>(
    `SELECT m.id, m.schedule_id, m.user_id, m.position, m.created_at, u.name AS user_name, u.email AS user_email
     FROM on_call_schedule_members m JOIN users u ON u.id = m.user_id
     WHERE m.schedule_id = $1 ORDER BY m.position ASC`,
    [scheduleId],
  );
  return rows.map(mapMemberRow);
}

// Ersetzt die komplette Teilnehmerliste in einer Transaktion - dasselbe
// Muster wie replaceEscalationSteps() (db/alert-events.repository.ts, Phase
// 9): der Client gibt IMMER die volle, gewuenschte Endliste (geordnet)
// statt einzelner Insert/Delete-Aufrufe, das vermeidet Race Conditions
// zwischen "Reihenfolge lesen" und "Reihenfolge schreiben" bei Reordering.
export async function replaceOnCallScheduleMembers(scheduleId: number, userIds: string[]): Promise<OnCallScheduleMemberWithUser[]> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM on_call_schedule_members WHERE schedule_id = $1`, [scheduleId]);
    for (let i = 0; i < userIds.length; i++) {
      await client.query(
        `INSERT INTO on_call_schedule_members (schedule_id, user_id, position) VALUES ($1, $2, $3)`,
        [scheduleId, userIds[i], i],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return listOnCallScheduleMembers(scheduleId);
}

// ---------------------------------------------------------------------------
// Overrides
// ---------------------------------------------------------------------------

interface OverrideRow {
  id: number;
  schedule_id: number;
  user_id: string;
  starts_at: string | Date;
  ends_at: string | Date;
  reason: string | null;
  created_by: string | null;
  created_at: string | Date;
}

function mapOverrideRow(row: OverrideRow): OnCallOverride {
  return {
    id: Number(row.id),
    scheduleId: Number(row.schedule_id),
    userId: row.user_id,
    startsAt: toIso(row.starts_at),
    endsAt: toIso(row.ends_at),
    reason: row.reason,
    createdBy: row.created_by,
    createdAt: toIso(row.created_at),
  };
}

interface OverrideRowWithUser extends OverrideRow {
  user_name: string;
  user_email: string;
}

function mapOverrideRowWithUser(row: OverrideRowWithUser): OnCallOverrideWithUser {
  return { ...mapOverrideRow(row), userName: row.user_name, userEmail: row.user_email };
}

export async function listOnCallOverrides(scheduleId: number): Promise<OnCallOverrideWithUser[]> {
  const { rows } = await pool.query<OverrideRowWithUser>(
    `SELECT o.id, o.schedule_id, o.user_id, o.starts_at, o.ends_at, o.reason, o.created_by, o.created_at,
       u.name AS user_name, u.email AS user_email
     FROM on_call_overrides o JOIN users u ON u.id = o.user_id
     WHERE o.schedule_id = $1 ORDER BY o.starts_at ASC`,
    [scheduleId],
  );
  return rows.map(mapOverrideRowWithUser);
}

// Fuer core/on-call.ts (Rotationsberechnung) - ungefiltert reicht hier
// bewusst nicht: bei Schedules mit vielen historischen Overrides waere das
// ein unnoetig wachsender Scan bei jeder "wer ist dran"-Abfrage. Begrenzt
// auf ein Zeitfenster, das die Aufrufer (routes/on-call.routes.ts) explizit
// vorgeben (aktueller Zeitpunkt +/- Timeline-Fenster).
export async function listOnCallOverridesInRange(scheduleId: number, from: Date, to: Date): Promise<OnCallOverride[]> {
  const { rows } = await pool.query<OverrideRow>(
    `SELECT id, schedule_id, user_id, starts_at, ends_at, reason, created_by, created_at
     FROM on_call_overrides
     WHERE schedule_id = $1 AND starts_at < $3 AND ends_at > $2
     ORDER BY starts_at ASC`,
    [scheduleId, from.toISOString(), to.toISOString()],
  );
  return rows.map(mapOverrideRow);
}

export async function getOnCallOverrideById(id: number): Promise<OnCallOverride | undefined> {
  const { rows } = await pool.query<OverrideRow>(
    `SELECT id, schedule_id, user_id, starts_at, ends_at, reason, created_by, created_at FROM on_call_overrides WHERE id = $1`,
    [id],
  );
  return rows[0] ? mapOverrideRow(rows[0]) : undefined;
}

export interface CreateOnCallOverrideInput {
  scheduleId: number;
  userId: string;
  startsAt: string;
  endsAt: string;
  reason?: string | null;
  createdBy?: string | null;
}

// Race-sicher: sperrt die schedule-Zeile (SELECT...FOR UPDATE, dasselbe
// Muster wie die Quota-Pruefungen oben) BEVOR auf Ueberlappung geprueft
// wird, damit zwei gleichzeitige Override-Anfragen fuer dasselbe Schedule
// nicht beide an derselben (zum Pruefzeitpunkt noch freien) Ueberlappungs-
// pruefung vorbeikommen.
export async function createOverrideIfNoOverlap(input: CreateOnCallOverrideInput): Promise<OnCallOverride | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT id FROM on_call_schedules WHERE id = $1 FOR UPDATE`, [input.scheduleId]);
    const { rows: overlapRows } = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM on_call_overrides
       WHERE schedule_id = $1 AND starts_at < $3 AND ends_at > $2`,
      [input.scheduleId, input.startsAt, input.endsAt],
    );
    if (Number(overlapRows[0]?.count ?? 0) > 0) {
      await client.query("ROLLBACK");
      return null;
    }

    const { rows } = await client.query<OverrideRow>(
      `INSERT INTO on_call_overrides (schedule_id, user_id, starts_at, ends_at, reason, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, schedule_id, user_id, starts_at, ends_at, reason, created_by, created_at`,
      [input.scheduleId, input.userId, input.startsAt, input.endsAt, input.reason ?? null, input.createdBy ?? null],
    );
    await client.query("COMMIT");
    const row = rows[0];
    if (!row) {
      throw new Error("Override konnte nicht angelegt werden");
    }
    return mapOverrideRow(row);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteOnCallOverride(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM on_call_overrides WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}
