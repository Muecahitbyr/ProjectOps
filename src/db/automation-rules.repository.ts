import { pool } from "./pool";
import type { AutomationActionType, AutomationRule, AutomationRuleConditions, AutomationTrigger } from "../types/automation.types";

interface AutomationRuleRow {
  id: number;
  project_id: string;
  team_id: string | null;
  name: string;
  check_type: string | null;
  min_severity: AutomationRule["minSeverity"];
  trigger: AutomationTrigger;
  priority: number;
  conditions: AutomationRuleConditions | null;
  action: AutomationActionType;
  auto_execute: boolean;
  approval_required: boolean;
  cooldown_minutes: number;
  max_executions_per_hour: number;
  enabled: boolean;
  risk_level: AutomationRule["riskLevel"];
  timeout_seconds: number;
  max_attempts_per_incident: number;
  created_by: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

const AUTOMATION_RULE_COLUMNS = `id, project_id, team_id, name, check_type, min_severity, trigger, priority, conditions,
  action, auto_execute, approval_required, cooldown_minutes, max_executions_per_hour, enabled,
  risk_level, timeout_seconds, max_attempts_per_incident, created_by, created_at, updated_at`;

function mapRow(row: AutomationRuleRow): AutomationRule {
  return {
    id: row.id,
    projectId: row.project_id,
    teamId: row.team_id,
    name: row.name,
    checkType: row.check_type,
    minSeverity: row.min_severity,
    trigger: row.trigger,
    priority: row.priority,
    conditions: row.conditions,
    action: row.action,
    autoExecute: row.auto_execute,
    approvalRequired: row.approval_required,
    cooldownMinutes: row.cooldown_minutes,
    maxExecutionsPerHour: row.max_executions_per_hour,
    enabled: row.enabled,
    riskLevel: row.risk_level,
    timeoutSeconds: row.timeout_seconds,
    maxAttemptsPerIncident: row.max_attempts_per_incident,
    createdBy: row.created_by,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

export interface ListAutomationRulesFilters {
  projectId?: string;
  projectIds?: string[];
  trigger?: AutomationTrigger;
  enabledOnly?: boolean;
  limit?: number;
  offset?: number;
}

// Sortierung nach priority ASC (kleinere Zahl = hoehere Prioritaet, siehe
// automation/automation-engine.ts) - bei Gleichstand die aeltere Regel
// zuerst, damit die Ausfuehrungsreihenfolge deterministisch bleibt. Phase 18
// Auftragspunkt 1 "Automation Rule Write API" - projectIds/limit/offset
// additiv (bestehende Aufrufer mit nur projectId/trigger/enabledOnly
// unveraendert) fuer GET /api/v1/automation/rules.
export async function listAutomationRules(options: ListAutomationRulesFilters = {}): Promise<AutomationRule[]> {
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
  if (options.trigger) {
    values.push(options.trigger);
    conditions.push(`trigger = $${values.length}`);
  }
  if (options.enabledOnly) {
    conditions.push(`enabled = true`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  if (options.limit === undefined) {
    const { rows } = await pool.query<AutomationRuleRow>(
      `SELECT ${AUTOMATION_RULE_COLUMNS} FROM automation_rules ${where} ORDER BY priority ASC, created_at ASC`,
      values,
    );
    return rows.map(mapRow);
  }

  values.push(options.limit);
  const limitIndex = values.length;
  values.push(options.offset ?? 0);
  const offsetIndex = values.length;
  const { rows } = await pool.query<AutomationRuleRow>(
    `SELECT ${AUTOMATION_RULE_COLUMNS} FROM automation_rules ${where} ORDER BY priority ASC, created_at ASC LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    values,
  );
  return rows.map(mapRow);
}

export async function countAutomationRules(options: { projectIds?: string[] } = {}): Promise<number> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (options.projectIds !== undefined) {
    values.push(options.projectIds);
    conditions.push(`project_id = ANY($${values.length})`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await pool.query<{ count: string }>(`SELECT COUNT(*) AS count FROM automation_rules ${where}`, values);
  return Number(rows[0]?.count ?? 0);
}

// Auftragspunkt 7 "Quota" (automationRulesPerOrganization) - Gesamtanzahl
// aller Regeln ueber ALLE Projekte einer Organisation hinweg (JOIN, da
// automation_rules keine eigene organization_id-Spalte hat, siehe
// db/projects.repository.ts.getProjectIdsForOrganization fuer dasselbe
// Muster an anderer Stelle).
export async function countAutomationRulesForOrganization(organizationId: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM automation_rules ar JOIN projects p ON p.id = ar.project_id WHERE p.organization_id = $1`,
    [organizationId],
  );
  return Number(rows[0]?.count ?? 0);
}

export async function getAutomationRuleById(id: number): Promise<AutomationRule | undefined> {
  const { rows } = await pool.query<AutomationRuleRow>(
    `SELECT ${AUTOMATION_RULE_COLUMNS} FROM automation_rules WHERE id = $1`,
    [id],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export interface CreateAutomationRuleInput {
  projectId: string;
  teamId?: string;
  name: string;
  checkType?: string;
  minSeverity: AutomationRule["minSeverity"];
  trigger: AutomationTrigger;
  priority?: number;
  conditions?: AutomationRuleConditions;
  action: AutomationActionType;
  autoExecute: boolean;
  approvalRequired: boolean;
  cooldownMinutes?: number;
  maxExecutionsPerHour?: number;
  enabled: boolean;
  riskLevel?: AutomationRule["riskLevel"];
  timeoutSeconds?: number;
  maxAttemptsPerIncident?: number;
  createdBy?: string;
}

export async function createAutomationRule(input: CreateAutomationRuleInput): Promise<AutomationRule> {
  const { rows } = await pool.query<AutomationRuleRow>(
    `INSERT INTO automation_rules
       (project_id, team_id, name, check_type, min_severity, trigger, priority, conditions, action,
        auto_execute, approval_required, cooldown_minutes, max_executions_per_hour, enabled,
        risk_level, timeout_seconds, max_attempts_per_incident, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
     RETURNING ${AUTOMATION_RULE_COLUMNS}`,
    [
      input.projectId,
      input.teamId ?? null,
      input.name,
      input.checkType ?? null,
      input.minSeverity,
      input.trigger,
      input.priority ?? 100,
      input.conditions ? JSON.stringify(input.conditions) : null,
      input.action,
      input.autoExecute,
      input.approvalRequired,
      input.cooldownMinutes ?? 15,
      input.maxExecutionsPerHour ?? 10,
      input.enabled,
      input.riskLevel ?? "MEDIUM",
      input.timeoutSeconds ?? 60,
      input.maxAttemptsPerIncident ?? 3,
      input.createdBy ?? null,
    ],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Automatisierungsregel konnte nicht gespeichert werden");
  }
  return mapRow(row);
}

export interface UpdateAutomationRuleInput {
  name?: string;
  teamId?: string | null;
  checkType?: string | null;
  minSeverity?: AutomationRule["minSeverity"];
  trigger?: AutomationTrigger;
  priority?: number;
  conditions?: AutomationRuleConditions | null;
  action?: AutomationActionType;
  autoExecute?: boolean;
  approvalRequired?: boolean;
  cooldownMinutes?: number;
  maxExecutionsPerHour?: number;
  enabled?: boolean;
  riskLevel?: AutomationRule["riskLevel"];
  timeoutSeconds?: number;
  maxAttemptsPerIncident?: number;
}

export async function updateAutomationRule(id: number, input: UpdateAutomationRuleInput): Promise<AutomationRule | undefined> {
  const sets: string[] = [];
  const values: unknown[] = [];

  const assign = (column: string, value: unknown): void => {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  };

  if (input.name !== undefined) assign("name", input.name);
  if (input.teamId !== undefined) assign("team_id", input.teamId);
  if (input.checkType !== undefined) assign("check_type", input.checkType);
  if (input.minSeverity !== undefined) assign("min_severity", input.minSeverity);
  if (input.trigger !== undefined) assign("trigger", input.trigger);
  if (input.priority !== undefined) assign("priority", input.priority);
  if (input.conditions !== undefined) assign("conditions", input.conditions === null ? null : JSON.stringify(input.conditions));
  if (input.action !== undefined) assign("action", input.action);
  if (input.autoExecute !== undefined) assign("auto_execute", input.autoExecute);
  if (input.approvalRequired !== undefined) assign("approval_required", input.approvalRequired);
  if (input.cooldownMinutes !== undefined) assign("cooldown_minutes", input.cooldownMinutes);
  if (input.maxExecutionsPerHour !== undefined) assign("max_executions_per_hour", input.maxExecutionsPerHour);
  if (input.enabled !== undefined) assign("enabled", input.enabled);
  if (input.riskLevel !== undefined) assign("risk_level", input.riskLevel);
  if (input.timeoutSeconds !== undefined) assign("timeout_seconds", input.timeoutSeconds);
  if (input.maxAttemptsPerIncident !== undefined) assign("max_attempts_per_incident", input.maxAttemptsPerIncident);

  if (sets.length === 0) {
    return getAutomationRuleById(id);
  }

  sets.push(`updated_at = now()`);
  values.push(id);

  const { rows } = await pool.query<AutomationRuleRow>(
    `UPDATE automation_rules SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING ${AUTOMATION_RULE_COLUMNS}`,
    values,
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function deleteAutomationRule(id: number): Promise<boolean> {
  const result = await pool.query(`DELETE FROM automation_rules WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

// Cooldown-Pruefung (Teil 1): wann wurde diese Regel zuletzt ausgeloest -
// unabhaengig vom Ergebnis (auch abgelehnte/fehlgeschlagene Ausloesungen
// zaehlen, sonst koennte eine staendig fehlschlagende Aktion den Cooldown
// umgehen).
export async function getLastTriggeredAtForRule(ruleId: number): Promise<string | undefined> {
  const { rows } = await pool.query<{ created_at: string | Date }>(
    `SELECT created_at FROM automation_actions WHERE rule_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [ruleId],
  );
  const row = rows[0];
  if (!row) return undefined;
  return row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at;
}

// Rate-Limit-Pruefung (Teil 1, maxExecutionsPerHour): Anzahl Ausloesungen
// dieser Regel in der letzten Stunde.
export async function countRuleTriggersInLastHour(ruleId: number): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM automation_actions WHERE rule_id = $1 AND created_at >= now() - interval '1 hour'`,
    [ruleId],
  );
  return Number(rows[0]?.count ?? 0);
}
