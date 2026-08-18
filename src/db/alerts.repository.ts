import { pool } from "./pool";
import type { AlertCondition, AlertRule, CreateAlertRuleInput, UpdateAlertRuleInput } from "../types/alert.types";

interface AlertRuleRow {
  id: number;
  project_id: string;
  name: string;
  rule_type: AlertRule["ruleType"];
  severity: AlertRule["severity"];
  metric: AlertRule["metric"];
  comparator: AlertRule["comparator"];
  threshold: string | null;
  severity_threshold: AlertRule["severityThreshold"];
  window_minutes: number | null;
  condition: AlertCondition | null;
  slo_id: number | null;
  enabled: boolean;
  currently_triggered: boolean;
  last_triggered_at: string | Date | null;
  last_triggered_value: string | null;
  created_by: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

const ALERT_RULE_COLUMNS = `
  id, project_id, name, rule_type, severity, metric, comparator, threshold, severity_threshold, window_minutes,
  condition, slo_id, enabled, currently_triggered, last_triggered_at, last_triggered_value, created_by, created_at, updated_at
`;

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toIsoStringOrNull(value: string | Date | null): string | null {
  return value === null ? null : toIsoString(value);
}

function mapRow(row: AlertRuleRow): AlertRule {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    ruleType: row.rule_type,
    severity: row.severity,
    metric: row.metric,
    comparator: row.comparator,
    threshold: row.threshold === null ? null : Number(row.threshold),
    severityThreshold: row.severity_threshold,
    windowMinutes: row.window_minutes,
    condition: row.condition,
    sloId: row.slo_id,
    enabled: row.enabled,
    currentlyTriggered: row.currently_triggered,
    lastTriggeredAt: toIsoStringOrNull(row.last_triggered_at),
    lastTriggeredValue: row.last_triggered_value,
    createdBy: row.created_by,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

// Phase 16 (2. Iteration) Auftragspunkt 3/12 "Oeffentliche API"/"Pagination"
// - projectIds/limit/offset additiv (bestehende Aufrufer mit nur
// projectId unveraendert). Fuer GET /api/v1/alerts (routes/v1/alerts.routes.ts).
export async function listAlertRules(
  options: { projectId?: string; projectIds?: string[]; limit?: number; offset?: number } = {},
): Promise<AlertRule[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (options.projectId) {
    values.push(options.projectId);
    conditions.push(`project_id = $${values.length}`);
  }
  if (options.projectIds !== undefined) {
    values.push(options.projectIds);
    conditions.push(`project_id = ANY($${values.length})`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limitClause = options.limit !== undefined ? ((values.push(options.limit), ` LIMIT $${values.length}`)) : "";
  const offsetClause = options.offset !== undefined ? ((values.push(options.offset), ` OFFSET $${values.length}`)) : "";
  const { rows } = await pool.query<AlertRuleRow>(
    `SELECT ${ALERT_RULE_COLUMNS} FROM alert_rules ${where} ORDER BY created_at DESC${limitClause}${offsetClause}`,
    values,
  );
  return rows.map(mapRow);
}

export async function countAlertRules(options: { projectIds?: string[] } = {}): Promise<number> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (options.projectIds !== undefined) {
    values.push(options.projectIds);
    conditions.push(`project_id = ANY($${values.length})`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await pool.query<{ count: string }>(`SELECT COUNT(*) AS count FROM alert_rules ${where}`, values);
  return Number(rows[0]?.count ?? 0);
}

// Phase 21 Auftragspunkt 17 "Alert Rule Quotas" - alert_rules hat keine
// eigene organization_id-Spalte (nur project_id), Zaehlung per JOIN, exakt
// dasselbe Muster wie countAutomationRulesForOrganization() (Phase 18).
export async function countAlertRulesForOrganization(organizationId: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM alert_rules ar JOIN projects p ON p.id = ar.project_id WHERE p.organization_id = $1`,
    [organizationId],
  );
  return Number(rows[0]?.count ?? 0);
}

export async function getAlertRuleById(id: number): Promise<AlertRule | undefined> {
  const { rows } = await pool.query<AlertRuleRow>(`SELECT ${ALERT_RULE_COLUMNS} FROM alert_rules WHERE id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : undefined;
}

// Nur aktivierte Regeln fuer Projekte mit mindestens einer Regel - der
// Evaluator (alerts/alert-evaluator.ts) ueberspringt Projekte ohne Regeln
// komplett, um die DB nicht unnoetig pro Scheduler-Tick zu belasten.
export async function getEnabledAlertRulesForProject(projectId: string): Promise<AlertRule[]> {
  const { rows } = await pool.query<AlertRuleRow>(
    `SELECT ${ALERT_RULE_COLUMNS} FROM alert_rules WHERE project_id = $1 AND enabled = true`,
    [projectId],
  );
  return rows.map(mapRow);
}

export async function createAlertRule(input: CreateAlertRuleInput): Promise<AlertRule> {
  const { rows } = await pool.query<AlertRuleRow>(
    `INSERT INTO alert_rules
       (project_id, name, rule_type, severity, metric, comparator, threshold, severity_threshold, window_minutes, condition, slo_id, enabled, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING ${ALERT_RULE_COLUMNS}`,
    [
      input.projectId,
      input.name,
      input.ruleType ?? "THRESHOLD",
      input.severity ?? "WARNING",
      input.metric,
      input.comparator,
      input.threshold ?? null,
      input.severityThreshold ?? null,
      input.windowMinutes ?? null,
      input.condition ? JSON.stringify(input.condition) : null,
      input.sloId ?? null,
      input.enabled ?? true,
      input.createdBy ?? null,
    ],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Alert-Regel konnte nicht angelegt werden");
  }
  return mapRow(row);
}

// Phase 21 Auftragspunkt 17 "Alert Rule Quotas" - "COUNT + INSERT ohne
// Schutz ist NICHT ausreichend": dasselbe race-sichere Muster wie
// createApiKeyIfUnderQuota() (Phase 20) - SELECT ... FOR UPDATE auf die
// Organisationszeile serialisiert alle gleichzeitigen Erstellungsversuche
// DERSELBEN Organisation (ueber alle ihre Projekte hinweg), COUNT und
// INSERT laufen danach garantiert konsistent in einer Transaktion. Gibt
// null zurueck, wenn das Limit erreicht ist (kein Reaktivierungspfad noetig
// - der Aufrufer wandelt das in 409 CONFLICT um).
export async function createAlertRuleIfUnderQuota(
  input: CreateAlertRuleInput,
  organizationId: string,
  maxAlertRules: number,
): Promise<AlertRule | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT id FROM organizations WHERE id = $1 FOR UPDATE`, [organizationId]);
    const { rows: countRows } = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM alert_rules ar JOIN projects p ON p.id = ar.project_id WHERE p.organization_id = $1`,
      [organizationId],
    );
    if (Number(countRows[0]?.count ?? 0) >= maxAlertRules) {
      await client.query("ROLLBACK");
      return null;
    }

    const { rows } = await client.query<AlertRuleRow>(
      `INSERT INTO alert_rules
         (project_id, name, rule_type, severity, metric, comparator, threshold, severity_threshold, window_minutes, condition, slo_id, enabled, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING ${ALERT_RULE_COLUMNS}`,
      [
        input.projectId,
        input.name,
        input.ruleType ?? "THRESHOLD",
        input.severity ?? "WARNING",
        input.metric,
        input.comparator,
        input.threshold ?? null,
        input.severityThreshold ?? null,
        input.windowMinutes ?? null,
        input.condition ? JSON.stringify(input.condition) : null,
        input.sloId ?? null,
        input.enabled ?? true,
        input.createdBy ?? null,
      ],
    );
    await client.query("COMMIT");
    const row = rows[0];
    if (!row) {
      throw new Error("Alert-Regel konnte nicht angelegt werden");
    }
    return mapRow(row);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function updateAlertRule(id: number, input: UpdateAlertRuleInput): Promise<AlertRule | undefined> {
  const fields: string[] = [];
  const values: unknown[] = [];

  const set = (column: string, value: unknown): void => {
    values.push(value);
    fields.push(`${column} = $${values.length}`);
  };

  if (input.name !== undefined) set("name", input.name);
  if (input.ruleType !== undefined) set("rule_type", input.ruleType);
  if (input.severity !== undefined) set("severity", input.severity);
  if (input.metric !== undefined) set("metric", input.metric);
  if (input.comparator !== undefined) set("comparator", input.comparator);
  if (input.threshold !== undefined) set("threshold", input.threshold);
  if (input.severityThreshold !== undefined) set("severity_threshold", input.severityThreshold);
  if (input.windowMinutes !== undefined) set("window_minutes", input.windowMinutes);
  if (input.condition !== undefined) set("condition", input.condition ? JSON.stringify(input.condition) : null);
  if (input.sloId !== undefined) set("slo_id", input.sloId);
  if (input.enabled !== undefined) set("enabled", input.enabled);

  if (fields.length === 0) {
    return getAlertRuleById(id);
  }

  fields.push(`updated_at = now()`);
  values.push(id);

  const { rows } = await pool.query<AlertRuleRow>(
    `UPDATE alert_rules SET ${fields.join(", ")} WHERE id = $${values.length} RETURNING ${ALERT_RULE_COLUMNS}`,
    values,
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function deleteAlertRule(id: number): Promise<boolean> {
  const result = await pool.query(`DELETE FROM alert_rules WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

export async function markAlertTriggered(id: number, value: string): Promise<AlertRule | undefined> {
  const { rows } = await pool.query<AlertRuleRow>(
    `UPDATE alert_rules
     SET currently_triggered = true, last_triggered_at = now(), last_triggered_value = $2, updated_at = now()
     WHERE id = $1
     RETURNING ${ALERT_RULE_COLUMNS}`,
    [id, value],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function markAlertResolved(id: number): Promise<AlertRule | undefined> {
  const { rows } = await pool.query<AlertRuleRow>(
    `UPDATE alert_rules SET currently_triggered = false, updated_at = now() WHERE id = $1 RETURNING ${ALERT_RULE_COLUMNS}`,
    [id],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}
