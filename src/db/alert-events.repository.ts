import { pool } from "./pool";
import type { AlertEscalationStep, AlertEvent, AlertEventQuery, AlertRuleSeverity, CreateEscalationStepInput } from "../types/alert.types";

interface AlertEventRow {
  id: number;
  alert_rule_id: number;
  alert_rule_name: string;
  project_id: string;
  project_name: string;
  severity: AlertRuleSeverity;
  status: AlertEvent["status"];
  started_at: string | Date;
  last_seen_at: string | Date;
  resolved_at: string | Date | null;
  occurrences: number;
  last_value: string | null;
  suppressed_reason: string | null;
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}
function toIsoStringOrNull(value: string | Date | null): string | null {
  return value === null ? null : toIsoString(value);
}

const ALERT_EVENT_SELECT = `
  SELECT ae.id, ae.alert_rule_id, ar.name AS alert_rule_name, ae.project_id, p.name AS project_name,
         ae.severity, ae.status, ae.started_at, ae.last_seen_at, ae.resolved_at, ae.occurrences,
         ae.last_value, ae.suppressed_reason
  FROM alert_events ae
  JOIN alert_rules ar ON ar.id = ae.alert_rule_id
  JOIN projects p ON p.id = ae.project_id
`;

function mapRow(row: AlertEventRow): AlertEvent {
  return {
    id: row.id,
    alertRuleId: row.alert_rule_id,
    alertRuleName: row.alert_rule_name,
    projectId: row.project_id,
    projectName: row.project_name,
    severity: row.severity,
    status: row.status,
    startedAt: toIsoString(row.started_at),
    lastSeenAt: toIsoString(row.last_seen_at),
    resolvedAt: toIsoStringOrNull(row.resolved_at),
    occurrences: row.occurrences,
    lastValue: row.last_value,
    suppressedReason: row.suppressed_reason,
  };
}

// Genau eine offene (TRIGGERED/SUPPRESSED) Episode pro Regel moeglich, siehe
// idx_alert_events_open_per_rule - das ist die Deduplizierung.
export async function getOpenAlertEvent(alertRuleId: number): Promise<AlertEvent | undefined> {
  const { rows } = await pool.query<AlertEventRow>(
    `${ALERT_EVENT_SELECT} WHERE ae.alert_rule_id = $1 AND ae.status IN ('TRIGGERED', 'SUPPRESSED')`,
    [alertRuleId],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export interface CreateAlertEventInput {
  alertRuleId: number;
  projectId: string;
  severity: AlertRuleSeverity;
  status: "TRIGGERED" | "SUPPRESSED";
  value: string;
  suppressedReason?: string;
}

export async function createAlertEvent(input: CreateAlertEventInput): Promise<AlertEvent> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO alert_events (alert_rule_id, project_id, severity, status, last_value, suppressed_reason)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [input.alertRuleId, input.projectId, input.severity, input.status, input.value, input.suppressedReason ?? null],
  );
  const id = rows[0]?.id;
  if (id === undefined) {
    throw new Error("Alert-Event konnte nicht angelegt werden");
  }
  const { rows: fullRows } = await pool.query<AlertEventRow>(`${ALERT_EVENT_SELECT} WHERE ae.id = $1`, [id]);
  const row = fullRows[0];
  if (!row) {
    throw new Error("Alert-Event konnte nicht geladen werden");
  }
  return mapRow(row);
}

// Bestaetigt eine anhaltend erfuellte Bedingung erneut: last_seen_at/
// occurrences aktualisieren, Status ggf. zwischen TRIGGERED und SUPPRESSED
// wechseln (z.B. wenn waehrend einer laufenden Episode ein Wartungsfenster
// beginnt oder endet).
export async function touchAlertEvent(
  id: number,
  value: string,
  status: "TRIGGERED" | "SUPPRESSED",
  suppressedReason?: string | null,
): Promise<AlertEvent | undefined> {
  await pool.query(
    `UPDATE alert_events
     SET last_seen_at = now(), occurrences = occurrences + 1, last_value = $2, status = $3, suppressed_reason = $4
     WHERE id = $1`,
    [id, value, status, suppressedReason ?? null],
  );
  const { rows } = await pool.query<AlertEventRow>(`${ALERT_EVENT_SELECT} WHERE ae.id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function resolveAlertEvent(id: number): Promise<AlertEvent | undefined> {
  await pool.query(`UPDATE alert_events SET status = 'RESOLVED', resolved_at = now() WHERE id = $1`, [id]);
  const { rows } = await pool.query<AlertEventRow>(`${ALERT_EVENT_SELECT} WHERE ae.id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function markEscalationStepFired(id: number, stepOrder: number): Promise<void> {
  await pool.query(`UPDATE alert_events SET last_escalated_step = $2 WHERE id = $1`, [id, stepOrder]);
}

export async function getLastEscalatedStep(id: number): Promise<number> {
  const { rows } = await pool.query<{ last_escalated_step: number }>(
    `SELECT last_escalated_step FROM alert_events WHERE id = $1`,
    [id],
  );
  return rows[0]?.last_escalated_step ?? 0;
}

export interface AlertEventListResult {
  total: number;
  items: AlertEvent[];
}

export async function listAlertEvents(query: AlertEventQuery = {}): Promise<AlertEventListResult> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (query.projectId) {
    values.push(query.projectId);
    conditions.push(`ae.project_id = $${values.length}`);
  }
  if (query.severity) {
    values.push(query.severity);
    conditions.push(`ae.severity = $${values.length}`);
  }
  if (query.status) {
    values.push(query.status);
    conditions.push(`ae.status = $${values.length}`);
  }
  if (query.from) {
    values.push(query.from);
    conditions.push(`ae.started_at >= $${values.length}`);
  }
  if (query.to) {
    values.push(query.to);
    conditions.push(`ae.started_at < $${values.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = query.limit ?? 50;
  const offset = query.offset ?? 0;

  values.push(limit);
  const limitParam = `$${values.length}`;
  values.push(offset);
  const offsetParam = `$${values.length}`;

  const { rows } = await pool.query<AlertEventRow & { total_count: string }>(
    `SELECT ae.id, ae.alert_rule_id, ar.name AS alert_rule_name, ae.project_id, p.name AS project_name,
            ae.severity, ae.status, ae.started_at, ae.last_seen_at, ae.resolved_at, ae.occurrences,
            ae.last_value, ae.suppressed_reason, COUNT(*) OVER() AS total_count
     FROM alert_events ae
     JOIN alert_rules ar ON ar.id = ae.alert_rule_id
     JOIN projects p ON p.id = ae.project_id
     ${where}
     ORDER BY ae.started_at DESC
     LIMIT ${limitParam} OFFSET ${offsetParam}`,
    values,
  );

  return { total: rows[0] ? Number(rows[0].total_count) : 0, items: rows.map(mapRow) };
}

// ---------------------------------------------------------------------------
// Eskalationsstufen
// ---------------------------------------------------------------------------
interface EscalationStepRow {
  id: number;
  alert_rule_id: number;
  step_order: number;
  after_minutes: number;
  channel_id: AlertEscalationStep["channelId"];
  additional_project_role: AlertEscalationStep["additionalProjectRole"];
  on_call_schedule_id: number | null;
  created_at: string | Date;
}

const ESCALATION_STEP_COLUMNS = `id, alert_rule_id, step_order, after_minutes, channel_id, additional_project_role, on_call_schedule_id, created_at`;

function mapEscalationRow(row: EscalationStepRow): AlertEscalationStep {
  return {
    id: row.id,
    alertRuleId: row.alert_rule_id,
    stepOrder: row.step_order,
    afterMinutes: row.after_minutes,
    channelId: row.channel_id,
    additionalProjectRole: row.additional_project_role,
    onCallScheduleId: row.on_call_schedule_id,
    createdAt: toIsoString(row.created_at),
  };
}

export async function listEscalationSteps(alertRuleId: number): Promise<AlertEscalationStep[]> {
  const { rows } = await pool.query<EscalationStepRow>(
    `SELECT ${ESCALATION_STEP_COLUMNS} FROM alert_escalation_steps WHERE alert_rule_id = $1 ORDER BY step_order`,
    [alertRuleId],
  );
  return rows.map(mapEscalationRow);
}

export async function listDueEscalationSteps(alertRuleId: number, afterStep: number, elapsedMinutes: number): Promise<AlertEscalationStep[]> {
  const { rows } = await pool.query<EscalationStepRow>(
    `SELECT ${ESCALATION_STEP_COLUMNS}
     FROM alert_escalation_steps
     WHERE alert_rule_id = $1 AND step_order > $2 AND after_minutes <= $3::double precision
     ORDER BY step_order`,
    [alertRuleId, afterStep, elapsedMinutes],
  );
  return rows.map(mapEscalationRow);
}

// Ersetzt die komplette Eskalationskette einer Regel in einer Transaktion -
// das UI editiert immer die vollstaendige, geordnete Liste auf einmal
// (siehe /alerts/create), ein granulares Insert/Update/Delete pro Stufe
// brueachte keinen echten Mehrwert und waere fehleranfaelliger (Reihenfolge).
export async function replaceEscalationSteps(alertRuleId: number, steps: CreateEscalationStepInput[]): Promise<AlertEscalationStep[]> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM alert_escalation_steps WHERE alert_rule_id = $1`, [alertRuleId]);
    for (const step of steps) {
      await client.query(
        `INSERT INTO alert_escalation_steps (alert_rule_id, step_order, after_minutes, channel_id, additional_project_role, on_call_schedule_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [alertRuleId, step.stepOrder, step.afterMinutes, step.channelId, step.additionalProjectRole ?? null, step.onCallScheduleId ?? null],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return listEscalationSteps(alertRuleId);
}
