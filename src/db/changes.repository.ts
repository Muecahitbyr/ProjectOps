import { pool } from "./pool";
import { isApprovalRequiredToStart } from "../config/change-management.config";
import type { Change, ChangeCategory, ChangeRisk, ChangeStatus, ChangeType } from "../types/change.types";

interface ChangeRow {
  id: string | number;
  organization_id: string;
  title: string;
  description: string | null;
  change_type: string;
  category: string;
  status: string;
  risk: string;
  risk_assessment: string | null;
  rollback_plan: string | null;
  owner_id: string | null;
  planned_start_at: string | Date | null;
  planned_end_at: string | Date | null;
  actual_start_at: string | Date | null;
  actual_end_at: string | Date | null;
  approval_status: string;
  approved_by: string | null;
  approved_at: string | Date | null;
  rejection_reason: string | null;
  emergency_justification: string | null;
  deployment_id: string | number | null;
  failure_reason: string | null;
  created_by: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

const CHANGE_COLUMNS = `
  id, organization_id, title, description, change_type, category, status, risk, risk_assessment, rollback_plan,
  owner_id, planned_start_at, planned_end_at, actual_start_at, actual_end_at, approval_status,
  approved_by, approved_at, rejection_reason, emergency_justification, deployment_id, failure_reason,
  created_by, created_at, updated_at
`;

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}
function toIsoOrNull(value: string | Date | null): string | null {
  return value === null ? null : toIso(value);
}

// BIGINT-Id - Lehre aus Phase 25/26/27: explizit konvertieren, sonst landet
// ein String statt einer Zahl in der JSON-Antwort.
function mapRow(row: ChangeRow): Change {
  return {
    id: Number(row.id),
    organizationId: row.organization_id,
    title: row.title,
    description: row.description,
    changeType: row.change_type as ChangeType,
    category: row.category as ChangeCategory,
    status: row.status as ChangeStatus,
    risk: row.risk as ChangeRisk,
    riskAssessment: row.risk_assessment,
    rollbackPlan: row.rollback_plan,
    ownerId: row.owner_id,
    plannedStartAt: toIsoOrNull(row.planned_start_at),
    plannedEndAt: toIsoOrNull(row.planned_end_at),
    actualStartAt: toIsoOrNull(row.actual_start_at),
    actualEndAt: toIsoOrNull(row.actual_end_at),
    approvalStatus: row.approval_status as Change["approvalStatus"],
    approvedBy: row.approved_by,
    approvedAt: toIsoOrNull(row.approved_at),
    rejectionReason: row.rejection_reason,
    emergencyJustification: row.emergency_justification,
    deploymentId: row.deployment_id === null ? null : Number(row.deployment_id),
    failureReason: row.failure_reason,
    createdBy: row.created_by,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export interface CreateChangeInput {
  organizationId: string;
  title: string;
  description?: string;
  changeType?: ChangeType;
  category?: ChangeCategory;
  risk?: ChangeRisk;
  riskAssessment?: string;
  rollbackPlan?: string;
  ownerId?: string;
  plannedStartAt?: string;
  plannedEndAt?: string;
  emergencyJustification?: string;
  deploymentId?: number;
  createdBy?: string;
}

// approval_status wird HIER (nicht im Route-Handler) aus Typ/Risiko
// abgeleitet - EIN Ort fuer die Regel (config/change-management.config.ts),
// egal ob ueber die interne Route oder spaeter eine externe API angelegt.
export async function createChange(input: CreateChangeInput): Promise<Change> {
  const changeType = input.changeType ?? "STANDARD";
  const category = input.category ?? "OTHER";
  const risk = input.risk ?? "LOW";
  const approvalStatus = changeType === "EMERGENCY" ? "NOT_REQUIRED" : "PENDING";

  const { rows } = await pool.query<ChangeRow>(
    `INSERT INTO changes (
       organization_id, title, description, change_type, category, risk, risk_assessment, rollback_plan,
       owner_id, planned_start_at, planned_end_at, approval_status, emergency_justification, deployment_id, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING ${CHANGE_COLUMNS}`,
    [
      input.organizationId,
      input.title,
      input.description ?? null,
      changeType,
      category,
      risk,
      input.riskAssessment ?? null,
      input.rollbackPlan ?? null,
      input.ownerId ?? null,
      input.plannedStartAt ?? null,
      input.plannedEndAt ?? null,
      approvalStatus,
      input.emergencyJustification ?? null,
      input.deploymentId ?? null,
      input.createdBy ?? null,
    ],
  );
  return mapRow(rows[0]!);
}

export interface ListChangesFilter {
  organizationId: string;
  status?: ChangeStatus;
  risk?: ChangeRisk;
  changeType?: ChangeType;
  category?: ChangeCategory;
  serviceId?: number;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export async function listChanges(filter: ListChangesFilter): Promise<Change[]> {
  const conditions = ["c.organization_id = $1"];
  const values: unknown[] = [filter.organizationId];
  let join = "";

  if (filter.status) {
    values.push(filter.status);
    conditions.push(`c.status = $${values.length}`);
  }
  if (filter.risk) {
    values.push(filter.risk);
    conditions.push(`c.risk = $${values.length}`);
  }
  if (filter.changeType) {
    values.push(filter.changeType);
    conditions.push(`c.change_type = $${values.length}`);
  }
  if (filter.category) {
    values.push(filter.category);
    conditions.push(`c.category = $${values.length}`);
  }
  if (filter.serviceId !== undefined) {
    join = "JOIN change_services cs ON cs.change_id = c.id";
    values.push(filter.serviceId);
    conditions.push(`cs.service_id = $${values.length}`);
  }
  if (filter.from) {
    values.push(filter.from);
    conditions.push(`(c.planned_end_at IS NULL OR c.planned_end_at >= $${values.length})`);
  }
  if (filter.to) {
    values.push(filter.to);
    conditions.push(`(c.planned_start_at IS NULL OR c.planned_start_at <= $${values.length})`);
  }

  values.push(filter.limit ?? 100);
  const limitIdx = values.length;
  values.push(filter.offset ?? 0);
  const offsetIdx = values.length;

  const { rows } = await pool.query<ChangeRow>(
    `SELECT DISTINCT ${CHANGE_COLUMNS.split(",").map((c) => `c.${c.trim()}`).join(", ")}
     FROM changes c ${join}
     WHERE ${conditions.join(" AND ")}
     ORDER BY c.created_at DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
    values,
  );
  return rows.map(mapRow);
}

export async function getChangeById(id: number): Promise<Change | undefined> {
  const { rows } = await pool.query<ChangeRow>(`SELECT ${CHANGE_COLUMNS} FROM changes WHERE id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function getChangeOrganizationId(id: number): Promise<string | undefined> {
  const { rows } = await pool.query<{ organization_id: string }>(`SELECT organization_id FROM changes WHERE id = $1`, [id]);
  return rows[0]?.organization_id;
}

export interface UpdateChangeInput {
  title?: string;
  description?: string | null;
  changeType?: ChangeType;
  category?: ChangeCategory;
  risk?: ChangeRisk;
  riskAssessment?: string | null;
  rollbackPlan?: string | null;
  ownerId?: string | null;
  plannedStartAt?: string | null;
  plannedEndAt?: string | null;
  emergencyJustification?: string | null;
  deploymentId?: number | null;
}

// Nur erlaubt, solange der Change noch nicht gestartet ist (DRAFT/SCHEDULED)
// - vom Route-Handler durchgesetzt, hier nur die reine Spaltenaktualisierung.
export async function updateChange(id: number, input: UpdateChangeInput): Promise<Change | undefined> {
  const sets: string[] = [];
  const values: unknown[] = [];
  const set = (column: string, value: unknown): void => {
    values.push(value);
    sets.push(`${column} = $${values.length}`);
  };
  if (input.title !== undefined) set("title", input.title);
  if (input.description !== undefined) set("description", input.description);
  if (input.changeType !== undefined) set("change_type", input.changeType);
  if (input.category !== undefined) set("category", input.category);
  if (input.risk !== undefined) set("risk", input.risk);
  if (input.riskAssessment !== undefined) set("risk_assessment", input.riskAssessment);
  if (input.rollbackPlan !== undefined) set("rollback_plan", input.rollbackPlan);
  if (input.ownerId !== undefined) set("owner_id", input.ownerId);
  if (input.plannedStartAt !== undefined) set("planned_start_at", input.plannedStartAt);
  if (input.plannedEndAt !== undefined) set("planned_end_at", input.plannedEndAt);
  if (input.emergencyJustification !== undefined) set("emergency_justification", input.emergencyJustification);
  if (input.deploymentId !== undefined) set("deployment_id", input.deploymentId);

  if (sets.length === 0) return getChangeById(id);
  sets.push("updated_at = now()");
  values.push(id);
  const { rows } = await pool.query<ChangeRow>(`UPDATE changes SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING ${CHANGE_COLUMNS}`, values);
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function deleteChange(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM changes WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Lifecycle: jede Funktion ist ein Compare-and-Swap-UPDATE (WHERE status =
// erwarteter Vorzustand) - exakt dasselbe Race-Safety-Muster wie
// markIncidentEscalationStepFired (Phase 27): genau EIN gleichzeitiger
// Aufruf gewinnt, alle anderen erhalten undefined (Auftragspunkt 15
// "keine doppelten Statusuebergaenge").
// ---------------------------------------------------------------------------

export async function scheduleChange(id: number): Promise<Change | undefined> {
  const { rows } = await pool.query<ChangeRow>(
    `UPDATE changes SET status = 'SCHEDULED', updated_at = now()
     WHERE id = $1 AND status = 'DRAFT' AND planned_start_at IS NOT NULL AND planned_end_at IS NOT NULL
     RETURNING ${CHANGE_COLUMNS}`,
    [id],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

// Auftragspunkt 7 - die Freigabe-Pruefung passiert HIER, atomar innerhalb
// derselben CAS-UPDATE-Bedingung (kein separates SELECT-dann-UPDATE, das
// zwei parallele Start-Versuche beide bestehen lassen koennte).
export async function startChange(id: number): Promise<Change | undefined | "APPROVAL_REQUIRED"> {
  const change = await getChangeById(id);
  if (!change) return undefined;
  if (change.status !== "SCHEDULED" && change.status !== "DRAFT") return undefined;
  if (isApprovalRequiredToStart(change.changeType, change.risk) && change.approvalStatus !== "APPROVED") {
    return "APPROVAL_REQUIRED";
  }
  const { rows } = await pool.query<ChangeRow>(
    `UPDATE changes SET status = 'IN_PROGRESS', actual_start_at = now(), updated_at = now()
     WHERE id = $1 AND status = $2
     RETURNING ${CHANGE_COLUMNS}`,
    [id, change.status],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function completeChange(id: number): Promise<Change | undefined> {
  const { rows } = await pool.query<ChangeRow>(
    `UPDATE changes SET status = 'COMPLETED', actual_end_at = now(), updated_at = now()
     WHERE id = $1 AND status = 'IN_PROGRESS'
     RETURNING ${CHANGE_COLUMNS}`,
    [id],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

// Phase 28 (Fortsetzung) - "War die Aenderung erfolgreich?": ein separater
// Endzustand von COMPLETED, dasselbe CAS-Muster wie completeChange()
// darueber. Bewusst identisch zu completeChange() bis auf Statuswert und
// den optionalen failure_reason - kein Grund fuer eine abweichende Logik.
export async function failChange(id: number, reason: string | undefined): Promise<Change | undefined> {
  const { rows } = await pool.query<ChangeRow>(
    `UPDATE changes SET status = 'FAILED', actual_end_at = now(), failure_reason = $2, updated_at = now()
     WHERE id = $1 AND status = 'IN_PROGRESS'
     RETURNING ${CHANGE_COLUMNS}`,
    [id, reason ?? null],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function cancelChange(id: number): Promise<Change | undefined> {
  const { rows } = await pool.query<ChangeRow>(
    `UPDATE changes SET status = 'CANCELLED', updated_at = now()
     WHERE id = $1 AND status IN ('DRAFT', 'SCHEDULED', 'IN_PROGRESS')
     RETURNING ${CHANGE_COLUMNS}`,
    [id],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function approveChange(id: number, approvedBy: string | undefined): Promise<Change | undefined> {
  const { rows } = await pool.query<ChangeRow>(
    `UPDATE changes SET approval_status = 'APPROVED', approved_by = $2, approved_at = now()
     WHERE id = $1 AND approval_status = 'PENDING'
     RETURNING ${CHANGE_COLUMNS}`,
    [id, approvedBy ?? null],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function rejectChange(id: number, rejectedBy: string | undefined, reason: string): Promise<Change | undefined> {
  const { rows } = await pool.query<ChangeRow>(
    `UPDATE changes SET approval_status = 'REJECTED', approved_by = $2, approved_at = now(), rejection_reason = $3
     WHERE id = $1 AND approval_status = 'PENDING'
     RETURNING ${CHANGE_COLUMNS}`,
    [id, rejectedBy ?? null, reason],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

// ---------------------------------------------------------------------------
// Service-Zuordnung (M:N) - vollstaendiges Ersetzen der Liste in einer
// Transaktion, dasselbe Muster wie replaceEscalationPolicySteps (Phase 27).
// ---------------------------------------------------------------------------

export async function listServiceIdsForChange(changeId: number): Promise<number[]> {
  const { rows } = await pool.query<{ service_id: string | number }>(`SELECT service_id FROM change_services WHERE change_id = $1`, [changeId]);
  return rows.map((r) => Number(r.service_id));
}

// Batch-Variante fuer die Listenansicht (Auftragspunkt 17 "keine N+1
// Queries") - eine Abfrage fuer alle betroffenen Changes statt einer pro
// Change, analog zu listActionItemsForPostmortems (Phase 26).
export async function listServiceIdsForChanges(changeIds: number[]): Promise<Map<number, number[]>> {
  const map = new Map<number, number[]>();
  if (changeIds.length === 0) return map;
  const { rows } = await pool.query<{ change_id: string | number; service_id: string | number }>(
    `SELECT change_id, service_id FROM change_services WHERE change_id = ANY($1)`,
    [changeIds],
  );
  for (const row of rows) {
    const changeId = Number(row.change_id);
    const existing = map.get(changeId);
    if (existing) existing.push(Number(row.service_id));
    else map.set(changeId, [Number(row.service_id)]);
  }
  return map;
}

export async function replaceChangeServices(changeId: number, serviceIds: number[]): Promise<number[]> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM change_services WHERE change_id = $1`, [changeId]);
    for (const serviceId of serviceIds) {
      await client.query(`INSERT INTO change_services (change_id, service_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [changeId, serviceId]);
    }
    await client.query("COMMIT");
    return serviceIds;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Auftragspunkt 5 "Incident Integration" - Changes, die einen der
// gegebenen Services betreffen (fuer die Korrelationsendpunkte, siehe
// routes/incidents.routes.ts GET .../change-context).
export async function listChangesForServiceIds(serviceIds: number[], statuses?: ChangeStatus[]): Promise<Change[]> {
  if (serviceIds.length === 0) return [];
  const values: unknown[] = [serviceIds];
  let statusFilter = "";
  if (statuses && statuses.length > 0) {
    values.push(statuses);
    statusFilter = `AND c.status = ANY($${values.length})`;
  }
  const { rows } = await pool.query<ChangeRow>(
    `SELECT DISTINCT ${CHANGE_COLUMNS.split(",").map((c) => `c.${c.trim()}`).join(", ")}
     FROM changes c JOIN change_services cs ON cs.change_id = c.id
     WHERE cs.service_id = ANY($1) ${statusFilter}
     ORDER BY c.created_at DESC LIMIT 50`,
    values,
  );
  return rows.map(mapRow);
}

// Auftragspunkt 6 "Incident Correlation" - "Welche Changes fanden
// unmittelbar vor einem Incident statt?", exakt dasselbe Muster/dieselbe
// Fensterlogik wie getRecentDeploymentsForProject() (db/deployments.
// repository.ts, Phase 27), hier ueber change_services statt project_id
// aufgeloest (ein Change kann mehrere Services betreffen, eine Deployment-
// Zeile gehoert immer zu genau einem Projekt). Der "Zeitpunkt" eines
// Change fuer die Korrelation ist der tatsaechliche Start, falls bereits
// gestartet, sonst der geplante Start, sonst der Erstellungszeitpunkt -
// "wann ist etwas an diesem Service passiert", nicht nur "wann wurde der
// Datensatz angelegt".
export async function getRecentChangesForService(
  serviceId: number,
  beforeTimestamp: string,
  windowMinutes: number,
  limit = 10,
): Promise<Change[]> {
  const { rows } = await pool.query<ChangeRow>(
    `SELECT DISTINCT ${CHANGE_COLUMNS.split(",").map((c) => `c.${c.trim()}`).join(", ")},
       COALESCE(c.actual_start_at, c.planned_start_at, c.created_at) AS effective_at
     FROM changes c JOIN change_services cs ON cs.change_id = c.id
     WHERE cs.service_id = $1
       AND COALESCE(c.actual_start_at, c.planned_start_at, c.created_at) <= $2::timestamptz
       AND COALESCE(c.actual_start_at, c.planned_start_at, c.created_at) >= $2::timestamptz - ($3 || ' minutes')::interval
     ORDER BY effective_at DESC
     LIMIT $4`,
    [serviceId, beforeTimestamp, windowMinutes, limit],
  );
  return rows.map(mapRow);
}

// Phase 29 "Enterprise Change Intelligence, Risk Correlation & Deployment
// Safety" Auftragspunkt 1 "kuerzlich fehlgeschlagene Changes" - EINE
// batchte Abfrage ueber ALLE zugeordneten Services eines Change (kein N+1,
// Auftragspunkt 12), gefiltert auf ein Zeitfenster relativ zum
// tatsaechlichen Fehlschlag-Zeitpunkt (actual_end_at, von failChange()
// gesetzt).
export async function listRecentlyFailedChangesForServices(serviceIds: number[], sinceHours: number): Promise<Change[]> {
  if (serviceIds.length === 0) return [];
  const { rows } = await pool.query<ChangeRow>(
    `SELECT DISTINCT ${CHANGE_COLUMNS.split(",").map((c) => `c.${c.trim()}`).join(", ")}
     FROM changes c JOIN change_services cs ON cs.change_id = c.id
     WHERE cs.service_id = ANY($1)
       AND c.status = 'FAILED'
       AND c.actual_end_at >= now() - ($2 || ' hours')::interval
     ORDER BY c.actual_end_at DESC
     LIMIT 20`,
    [serviceIds, sinceHours],
  );
  return rows.map(mapRow);
}
