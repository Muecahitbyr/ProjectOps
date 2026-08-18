import { pool } from "./pool";
import type { AutomationAction, AutomationActionContext, AutomationActionType } from "../types/automation.types";

interface AutomationActionRow {
  id: number;
  project_id: string;
  incident_id: number | null;
  rule_id: number | null;
  action: AutomationActionType;
  trigger: string;
  context: AutomationActionContext | null;
  status: AutomationAction["status"];
  created_at: string | Date;
}

const AUTOMATION_ACTION_COLUMNS = `id, project_id, incident_id, rule_id, action, trigger, context, status, created_at`;

function mapRow(row: AutomationActionRow): AutomationAction {
  return {
    id: row.id,
    projectId: row.project_id,
    incidentId: row.incident_id,
    ruleId: row.rule_id,
    action: row.action,
    trigger: row.trigger,
    context: row.context,
    status: row.status,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

export interface ProposeAutomationActionInput {
  projectId: string;
  incidentId: number;
  action: AutomationActionType;
  trigger: string;
}

// Legt ausschliesslich einen VORSCHLAG an (status bleibt 'PROPOSED') - siehe
// incidents/automation-suggestions.ts fuer die deterministische Zuordnung
// Check-Typ -> Aktion. Unveraendert aus Phase 9/10 - der neue, regelbasierte
// Weg ist createRuleTriggeredAction() unten.
export async function proposeAutomationAction(input: ProposeAutomationActionInput): Promise<AutomationAction> {
  const { rows } = await pool.query<AutomationActionRow>(
    `INSERT INTO automation_actions (project_id, incident_id, action, trigger)
     VALUES ($1, $2, $3, $4)
     RETURNING ${AUTOMATION_ACTION_COLUMNS}`,
    [input.projectId, input.incidentId, input.action, input.trigger],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Automatisierungsvorschlag konnte nicht gespeichert werden");
  }
  return mapRow(row);
}

export interface CreateRuleTriggeredActionInput {
  projectId: string;
  incidentId?: number;
  ruleId: number;
  action: AutomationActionType;
  trigger: string;
  context?: AutomationActionContext;
}

// Phase 11 Teil 1 "Automation Rules aktivieren" - eine von automation-engine.ts
// erzeugte Aktion, die auf eine konkrete Regel zurueckfuehrbar ist (rule_id)
// und den strukturierten Ausloese-Kontext traegt (context).
//
// Phase 66 "Enterprise Final Hardening & Production Readiness" - live
// gefundene Race Condition: trotz des bereits bestehenden
// idx_automation_actions_rule_incident_active-Unique-Index (Migration 0053,
// dessen eigener Kommentar bereits explizit "INSERT ... ON CONFLICT DO
// NOTHING + anschliessendes SELECT" als vorgesehenes Muster beschreibt) tat
// dieses INSERT bisher genau das NICHT - ein zweiter, gleichzeitig
// eintreffender Trigger fuer dasselbe (rule_id, incident_id)-Paar (z.B.
// doppelt gelieferte Webhook-/Monitor-Ereignisse) warf stattdessen einen
// rohen 23505-Fehler, der von evaluateAutomationTriggers()s try/catch nur
// geloggt wurde - der zweite Trigger ging damit verloren statt (wie
// beabsichtigt) auf dieselbe, bereits existierende Aktion zu treffen. Jetzt
// ON CONFLICT DO NOTHING (exakt auf den Index-Constraint gezielt) + Fallback
// auf findActionByRuleAndIncident(), falls der INSERT wegen einer
// gleichzeitig gewonnenen Aktion nichts zurueckgab.
export async function createRuleTriggeredAction(input: CreateRuleTriggeredActionInput): Promise<AutomationAction> {
  const { rows } = await pool.query<AutomationActionRow>(
    `INSERT INTO automation_actions (project_id, incident_id, rule_id, action, trigger, context)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (rule_id, incident_id) WHERE status <> 'REJECTED' AND rule_id IS NOT NULL AND incident_id IS NOT NULL
     DO NOTHING
     RETURNING ${AUTOMATION_ACTION_COLUMNS}`,
    [
      input.projectId,
      input.incidentId ?? null,
      input.ruleId,
      input.action,
      input.trigger,
      input.context ? JSON.stringify(input.context) : null,
    ],
  );
  const row = rows[0];
  if (row) {
    return mapRow(row);
  }
  // Kein Row zurueckgegeben => ON CONFLICT griff (nur moeglich, wenn
  // incidentId gesetzt war) - eine gleichzeitige Aktion hat bereits
  // gewonnen; dieselbe Zeile zurueckgeben statt einen Fehler zu werfen.
  if (input.incidentId !== undefined) {
    const existing = await findActionByRuleAndIncident(input.ruleId, input.incidentId);
    if (existing) return existing;
  }
  throw new Error("Automatisierungsvorschlag konnte nicht gespeichert werden");
}

// Phase 17 Auftragspunkt 8 "Automation Read API" - projectIds/offset
// additiv (bestehende Aufrufer mit projectId unveraendert). Fuer
// GET /api/v1/automation/actions (routes/v1/automation.routes.ts).
export async function listAutomationActions(
  options: { projectId?: string; projectIds?: string[]; status?: AutomationAction["status"]; limit?: number; offset?: number } = {},
): Promise<AutomationAction[]> {
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
  if (options.status) {
    values.push(options.status);
    conditions.push(`status = $${values.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  values.push(options.limit ?? 100);
  const limitIndex = values.length;
  values.push(options.offset ?? 0);
  const offsetIndex = values.length;

  const { rows } = await pool.query<AutomationActionRow>(
    `SELECT ${AUTOMATION_ACTION_COLUMNS} FROM automation_actions ${where} ORDER BY created_at DESC LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    values,
  );
  return rows.map(mapRow);
}

export async function countAutomationActions(options: { projectIds?: string[]; status?: AutomationAction["status"] } = {}): Promise<number> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (options.projectIds !== undefined) {
    values.push(options.projectIds);
    conditions.push(`project_id = ANY($${values.length})`);
  }
  if (options.status) {
    values.push(options.status);
    conditions.push(`status = $${values.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows } = await pool.query<{ count: string }>(`SELECT COUNT(*) AS count FROM automation_actions ${where}`, values);
  return Number(rows[0]?.count ?? 0);
}

export async function getAutomationActionById(id: number): Promise<AutomationAction | undefined> {
  const { rows } = await pool.query<AutomationActionRow>(
    `SELECT ${AUTOMATION_ACTION_COLUMNS} FROM automation_actions WHERE id = $1`,
    [id],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

// Phase 30 "Enterprise Reliability, Automated Recovery & Operational
// Resilience" - fuer GET /incidents/:id/recovery-actions (Anzeige des
// aktuellen Stands, falls fuer dieses (Regel, Incident)-Paar schon einmal
// versucht wurde).
export async function findActionByRuleAndIncident(ruleId: number, incidentId: number): Promise<AutomationAction | undefined> {
  const { rows } = await pool.query<AutomationActionRow>(
    `SELECT ${AUTOMATION_ACTION_COLUMNS} FROM automation_actions
     WHERE rule_id = $1 AND incident_id = $2 AND status <> 'REJECTED'
     ORDER BY created_at DESC LIMIT 1`,
    [ruleId, incidentId],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

// Race-safe "Finde oder erzeuge" (Auftragspunkt 5 "Idempotenz/Race Safety")
// fuer den neuen manuellen Incident->Recovery-Fluss (routes/incidents.routes.ts):
// mehrere parallele Ausfuehrungsanfragen fuer denselben (Regel, Incident)
// muessen garantiert auf DIESELBE Aktionszeile treffen, damit der
// Execution-Lock (idx_automation_executions_one_active_per_action, Migration
// 0053) tatsaechlich greift. ON CONFLICT DO NOTHING gegen den partiellen
// Unique-Index idx_automation_actions_rule_incident_active (Migration 0053) +
// anschliessendes SELECT ist dasselbe bewaehrte Race-Safety-Muster wie
// db/service-dependencies.repository.ts#createDependencyIfUnderQuota.
export async function findOrCreateManualRecoveryAction(input: CreateRuleTriggeredActionInput): Promise<AutomationAction> {
  if (input.incidentId === undefined) {
    throw new Error("findOrCreateManualRecoveryAction benoetigt eine incidentId");
  }
  await pool.query(
    `INSERT INTO automation_actions (project_id, incident_id, rule_id, action, trigger, context)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (rule_id, incident_id) WHERE status <> 'REJECTED' AND rule_id IS NOT NULL AND incident_id IS NOT NULL
     DO NOTHING`,
    [
      input.projectId,
      input.incidentId,
      input.ruleId,
      input.action,
      input.trigger,
      input.context ? JSON.stringify(input.context) : null,
    ],
  );
  const existing = await findActionByRuleAndIncident(input.ruleId, input.incidentId);
  if (!existing) {
    throw new Error("Recovery-Aktion konnte nicht gefunden oder angelegt werden");
  }
  return existing;
}

// Phase 66 "Enterprise Final Hardening & Production Readiness" - live
// gefundene Race Condition: ohne eine Status-Vorbedingung in der WHERE-
// Klausel konnten zwei gleichzeitige PATCH /automation-actions/:id (z.B.
// ein Doppelklick oder ein Netzwerk-Retry) beide erfolgreich durchlaufen -
// jeweils mit eigenem Realtime-Broadcast und eigenem Audit-Eintrag
// (routes/automation-actions.routes.ts), sogar mit widerspruechlichem
// Endzustand (REJECTED-Broadcast nach bereits erfolgtem APPROVED). Dasselbe
// Compare-and-Swap-Muster wie approveChange()/rejectChange()
// (db/changes.repository.ts) - nur der ERSTE Aufruf aus PROPOSED gewinnt,
// jeder weitere liefert undefined (Route antwortet dann mit 409).
export async function updateAutomationActionStatus(
  id: number,
  status: AutomationAction["status"],
): Promise<AutomationAction | undefined> {
  const { rows } = await pool.query<AutomationActionRow>(
    `UPDATE automation_actions SET status = $2 WHERE id = $1 AND status = 'PROPOSED' RETURNING ${AUTOMATION_ACTION_COLUMNS}`,
    [id, status],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}
