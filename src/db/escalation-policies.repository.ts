import { pool } from "./pool";
import type { EscalationPolicy, EscalationPolicyStep, EscalationTargetType } from "../types/escalation-policy.types";

interface PolicyRow {
  id: string | number;
  organization_id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  created_by: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

interface StepRow {
  id: string | number;
  policy_id: string | number;
  step_order: number;
  delay_minutes: number;
  target_type: string;
  target_user_id: string | null;
  target_schedule_id: string | number | null;
  created_at: string | Date;
}

const POLICY_COLUMNS = `id, organization_id, name, description, enabled, created_by, created_at, updated_at`;
const STEP_COLUMNS = `id, policy_id, step_order, delay_minutes, target_type, target_user_id, target_schedule_id, created_at`;

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

// BIGINT-Spalten - Lehre aus Phase 25/26: explizit konvertieren, sonst
// landet ein String statt einer Zahl in der JSON-Antwort.
function mapPolicyRow(row: PolicyRow): EscalationPolicy {
  return {
    id: Number(row.id),
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    enabled: row.enabled,
    createdBy: row.created_by,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapStepRow(row: StepRow): EscalationPolicyStep {
  return {
    id: Number(row.id),
    policyId: Number(row.policy_id),
    stepOrder: row.step_order,
    delayMinutes: row.delay_minutes,
    targetType: row.target_type as EscalationTargetType,
    targetUserId: row.target_user_id,
    targetScheduleId: row.target_schedule_id === null ? null : Number(row.target_schedule_id),
    createdAt: toIso(row.created_at),
  };
}

export interface CreatePolicyInput {
  organizationId: string;
  name: string;
  description?: string;
  enabled?: boolean;
  createdBy?: string;
}

// Race-sicher: SELECT...FOR UPDATE auf der Organisationszeile serialisiert
// gleichzeitige Erstellungsversuche, exakt dasselbe Transaktionsmuster wie
// createOnCallScheduleIfUnderQuota() (Phase 24) - vermeidet die TOCTOU-Race
// eines getrennten COUNT()+INSERT (siehe dortiger Kommentar).
export async function createEscalationPolicyIfUnderQuota(input: CreatePolicyInput, maxPolicies: number): Promise<EscalationPolicy | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT id FROM organizations WHERE id = $1 FOR UPDATE`, [input.organizationId]);
    const { rows: countRows } = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM escalation_policies WHERE organization_id = $1`,
      [input.organizationId],
    );
    if (Number(countRows[0]?.count ?? 0) >= maxPolicies) {
      await client.query("ROLLBACK");
      return null;
    }

    const { rows } = await client.query<PolicyRow>(
      `INSERT INTO escalation_policies (organization_id, name, description, enabled, created_by)
       VALUES ($1, $2, $3, COALESCE($4, true), $5)
       RETURNING ${POLICY_COLUMNS}`,
      [input.organizationId, input.name, input.description ?? null, input.enabled ?? null, input.createdBy ?? null],
    );
    await client.query("COMMIT");
    const row = rows[0];
    if (!row) {
      throw new Error("Escalation Policy konnte nicht angelegt werden");
    }
    return mapPolicyRow(row);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function listEscalationPolicies(organizationId: string): Promise<EscalationPolicy[]> {
  const { rows } = await pool.query<PolicyRow>(
    `SELECT ${POLICY_COLUMNS} FROM escalation_policies WHERE organization_id = $1 ORDER BY name`,
    [organizationId],
  );
  return rows.map(mapPolicyRow);
}

export async function getEscalationPolicyById(id: number): Promise<EscalationPolicy | undefined> {
  const { rows } = await pool.query<PolicyRow>(`SELECT ${POLICY_COLUMNS} FROM escalation_policies WHERE id = $1`, [id]);
  return rows[0] ? mapPolicyRow(rows[0]) : undefined;
}

export async function getEscalationPolicyOrganizationId(id: number): Promise<string | undefined> {
  const { rows } = await pool.query<{ organization_id: string }>(
    `SELECT organization_id FROM escalation_policies WHERE id = $1`,
    [id],
  );
  return rows[0]?.organization_id;
}

export interface UpdatePolicyInput {
  name?: string;
  description?: string | null;
  enabled?: boolean;
}

export async function updateEscalationPolicy(id: number, input: UpdatePolicyInput): Promise<EscalationPolicy | undefined> {
  const sets: string[] = [];
  const values: unknown[] = [];
  const set = (column: string, value: unknown): void => {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  };
  if (input.name !== undefined) set("name", input.name);
  if (input.description !== undefined) set("description", input.description);
  if (input.enabled !== undefined) set("enabled", input.enabled);

  if (sets.length === 0) {
    return getEscalationPolicyById(id);
  }
  sets.push("updated_at = now()");
  values.push(id);
  const { rows } = await pool.query<PolicyRow>(
    `UPDATE escalation_policies SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING ${POLICY_COLUMNS}`,
    values,
  );
  return rows[0] ? mapPolicyRow(rows[0]) : undefined;
}

export async function deleteEscalationPolicy(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM escalation_policies WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

export async function listEscalationSteps(policyId: number): Promise<EscalationPolicyStep[]> {
  const { rows } = await pool.query<StepRow>(
    `SELECT ${STEP_COLUMNS} FROM escalation_policy_steps WHERE policy_id = $1 ORDER BY step_order`,
    [policyId],
  );
  return rows.map(mapStepRow);
}

// Batch-Variante fuer core/incident-escalation.ts - EINE Abfrage fuer alle
// betroffenen Policies eines Scheduler-Ticks statt einer Abfrage pro
// Incident (Auftragspunkt 13 "keine N+1 Queries"), analog zu
// listActionItemsForPostmortems() (Phase 26).
export async function listEscalationStepsForPolicies(policyIds: number[]): Promise<Map<number, EscalationPolicyStep[]>> {
  const map = new Map<number, EscalationPolicyStep[]>();
  if (policyIds.length === 0) return map;
  const { rows } = await pool.query<StepRow>(
    `SELECT ${STEP_COLUMNS} FROM escalation_policy_steps WHERE policy_id = ANY($1) ORDER BY policy_id, step_order`,
    [policyIds],
  );
  for (const row of rows) {
    const step = mapStepRow(row);
    const existing = map.get(step.policyId);
    if (existing) existing.push(step);
    else map.set(step.policyId, [step]);
  }
  return map;
}

export interface CreateStepInput {
  stepOrder: number;
  delayMinutes: number;
  targetType: EscalationTargetType;
  targetUserId?: string;
  targetScheduleId?: number;
}

// Ersetzt die komplette Stufenkette einer Policy in einer Transaktion -
// exakt dasselbe Muster wie replaceEscalationSteps() fuer Alert-Regeln
// (db/alert-events.repository.ts, Phase 20): das UI editiert immer die
// vollstaendige, geordnete Liste auf einmal, ein granulares Insert/Update/
// Delete pro Stufe braeuchte keinen echten Mehrwert und waere bei der
// Reihenfolge fehleranfaelliger.
export async function replaceEscalationPolicySteps(policyId: number, steps: CreateStepInput[]): Promise<EscalationPolicyStep[]> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM escalation_policy_steps WHERE policy_id = $1`, [policyId]);
    const inserted: StepRow[] = [];
    for (const step of steps) {
      const { rows } = await client.query<StepRow>(
        `INSERT INTO escalation_policy_steps (policy_id, step_order, delay_minutes, target_type, target_user_id, target_schedule_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING ${STEP_COLUMNS}`,
        [
          policyId,
          step.stepOrder,
          step.delayMinutes,
          step.targetType,
          step.targetType === "USER" ? (step.targetUserId ?? null) : null,
          step.targetType === "ON_CALL_SCHEDULE" ? (step.targetScheduleId ?? null) : null,
        ],
      );
      inserted.push(rows[0]!);
    }
    await client.query("COMMIT");
    return inserted.map(mapStepRow);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function countServicesUsingPolicy(policyId: number): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM services WHERE escalation_policy_id = $1`,
    [policyId],
  );
  return Number(rows[0]?.count ?? 0);
}
