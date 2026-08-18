import { pool } from "./pool";
import type { ActionItemStatus, IncidentPostmortem, PostmortemActionItem, PostmortemStatus } from "../types/postmortem.types";

interface PostmortemRow {
  id: number;
  incident_id: number;
  status: string;
  summary: string | null;
  impact: string | null;
  root_cause: string | null;
  resolution: string | null;
  timeline_notes: string | null;
  created_by: string | null;
  published_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
}

const POSTMORTEM_COLUMNS = `
  id, incident_id, status, summary, impact, root_cause, resolution, timeline_notes,
  created_by, published_at, created_at, updated_at
`;

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function mapPostmortemRow(row: PostmortemRow): IncidentPostmortem {
  return {
    // BIGSERIAL-Spalten kommen vom pg-Treiber als STRING - dieselbe, in
    // dieser Codebase bereits mehrfach dokumentierte und (u.a. Phase 25 live
    // gefunden) gebugfixte Falle. Hier von Anfang an korrekt behandelt.
    id: Number(row.id),
    incidentId: Number(row.incident_id),
    status: row.status as PostmortemStatus,
    summary: row.summary,
    impact: row.impact,
    rootCause: row.root_cause,
    resolution: row.resolution,
    timelineNotes: row.timeline_notes,
    createdBy: row.created_by,
    publishedAt: row.published_at ? toIso(row.published_at) : null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export interface ListPostmortemsFilter {
  status?: PostmortemStatus;
  limit?: number;
  offset?: number;
}

export async function listPostmortems(filter: ListPostmortemsFilter = {}): Promise<IncidentPostmortem[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (filter.status) {
    values.push(filter.status);
    conditions.push(`status = $${values.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  values.push(filter.limit ?? 100);
  const limitIndex = values.length;
  values.push(filter.offset ?? 0);
  const offsetIndex = values.length;
  const { rows } = await pool.query<PostmortemRow>(
    `SELECT ${POSTMORTEM_COLUMNS} FROM incident_postmortems ${where} ORDER BY created_at DESC LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    values,
  );
  return rows.map(mapPostmortemRow);
}

export async function getPostmortemById(id: number): Promise<IncidentPostmortem | undefined> {
  const { rows } = await pool.query<PostmortemRow>(`SELECT ${POSTMORTEM_COLUMNS} FROM incident_postmortems WHERE id = $1`, [id]);
  return rows[0] ? mapPostmortemRow(rows[0]) : undefined;
}

export async function getPostmortemByIncidentId(incidentId: number): Promise<IncidentPostmortem | undefined> {
  const { rows } = await pool.query<PostmortemRow>(`SELECT ${POSTMORTEM_COLUMNS} FROM incident_postmortems WHERE incident_id = $1`, [incidentId]);
  return rows[0] ? mapPostmortemRow(rows[0]) : undefined;
}

// Phase 35 "Enterprise Problem Management & Root-Cause Intelligence" -
// Batch-Variante von getPostmortemByIncidentId() fuer die Problem-Detail-
// Seite (ein Problem kann mehrere verknuepfte Incidents haben) - EINE
// Abfrage statt einer pro Incident (kein N+1), analog zu
// getLatestSloEvaluationsForIds() (Phase 34).
export async function getPostmortemsByIncidentIds(incidentIds: number[]): Promise<Map<number, IncidentPostmortem>> {
  if (incidentIds.length === 0) return new Map();
  const { rows } = await pool.query<PostmortemRow>(
    `SELECT ${POSTMORTEM_COLUMNS} FROM incident_postmortems WHERE incident_id = ANY($1::bigint[])`,
    [incidentIds],
  );
  return new Map(rows.map((row) => [Number(row.incident_id), mapPostmortemRow(row)]));
}

export interface CreatePostmortemInput {
  incidentId: number;
  summary?: string | null;
  impact?: string | null;
  rootCause?: string | null;
  resolution?: string | null;
  timelineNotes?: string | null;
  createdBy?: string | null;
}

// Race-sicher OHNE SELECT...FOR UPDATE: incident_id ist UNIQUE (Migration
// 0047), ein zweiter gleichzeitiger Erstellungsversuch fuer denselben
// Incident kollidiert mit der Constraint selbst - ON CONFLICT DO NOTHING
// macht daraus ein sauberes "null zurueck" statt eines Fehlers, der Aufrufer
// (routes/incidents.routes.ts) meldet dann 409 statt eines doppelten
// Postmortems. Einfacher und ebenso race-sicher wie das SELECT...FOR
// UPDATE-Muster der Plan-Quotas (hier keine Quota, sondern eine echte
// 1:1-Datenintegritaetsregel).
export async function createPostmortemIfNotExists(input: CreatePostmortemInput): Promise<IncidentPostmortem | null> {
  const { rows } = await pool.query<PostmortemRow>(
    `INSERT INTO incident_postmortems (incident_id, summary, impact, root_cause, resolution, timeline_notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (incident_id) DO NOTHING
     RETURNING ${POSTMORTEM_COLUMNS}`,
    [
      input.incidentId,
      input.summary ?? null,
      input.impact ?? null,
      input.rootCause ?? null,
      input.resolution ?? null,
      input.timelineNotes ?? null,
      input.createdBy ?? null,
    ],
  );
  return rows[0] ? mapPostmortemRow(rows[0]) : null;
}

export interface UpdatePostmortemInput {
  status?: PostmortemStatus;
  summary?: string | null;
  impact?: string | null;
  rootCause?: string | null;
  resolution?: string | null;
  timelineNotes?: string | null;
  publishedAt?: string | null;
}

export async function updatePostmortem(id: number, input: UpdatePostmortemInput): Promise<IncidentPostmortem | undefined> {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (input.status !== undefined) {
    values.push(input.status);
    sets.push(`status = $${values.length}`);
  }
  if (input.summary !== undefined) {
    values.push(input.summary);
    sets.push(`summary = $${values.length}`);
  }
  if (input.impact !== undefined) {
    values.push(input.impact);
    sets.push(`impact = $${values.length}`);
  }
  if (input.rootCause !== undefined) {
    values.push(input.rootCause);
    sets.push(`root_cause = $${values.length}`);
  }
  if (input.resolution !== undefined) {
    values.push(input.resolution);
    sets.push(`resolution = $${values.length}`);
  }
  if (input.timelineNotes !== undefined) {
    values.push(input.timelineNotes);
    sets.push(`timeline_notes = $${values.length}`);
  }
  if (input.publishedAt !== undefined) {
    values.push(input.publishedAt);
    sets.push(`published_at = $${values.length}`);
  }
  if (sets.length === 0) {
    return getPostmortemById(id);
  }
  sets.push(`updated_at = now()`);
  values.push(id);
  const { rows } = await pool.query<PostmortemRow>(
    `UPDATE incident_postmortems SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING ${POSTMORTEM_COLUMNS}`,
    values,
  );
  return rows[0] ? mapPostmortemRow(rows[0]) : undefined;
}

export async function deletePostmortem(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM incident_postmortems WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Action Items
// ---------------------------------------------------------------------------

interface ActionItemRow {
  id: number;
  postmortem_id: number;
  description: string;
  assignee_id: string | null;
  due_date: string | Date | null;
  status: string;
  created_by: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

const ACTION_ITEM_COLUMNS = `id, postmortem_id, description, assignee_id, due_date, status, created_by, created_at, updated_at`;

function mapActionItemRow(row: ActionItemRow): PostmortemActionItem {
  return {
    id: Number(row.id),
    postmortemId: Number(row.postmortem_id),
    description: row.description,
    assigneeId: row.assignee_id,
    dueDate: row.due_date ? (row.due_date instanceof Date ? row.due_date.toISOString().slice(0, 10) : row.due_date) : null,
    status: row.status as ActionItemStatus,
    createdBy: row.created_by,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

export async function listActionItems(postmortemId: number): Promise<PostmortemActionItem[]> {
  const { rows } = await pool.query<ActionItemRow>(
    `SELECT ${ACTION_ITEM_COLUMNS} FROM incident_postmortem_action_items WHERE postmortem_id = $1 ORDER BY created_at ASC`,
    [postmortemId],
  );
  return rows.map(mapActionItemRow);
}

// Batched Variante fuer "mehrere Postmortems auf einmal mit ihren Action
// Items anreichern" (z.B. die Listenansicht /postmortems) - EINE Abfrage
// statt einer je Postmortem (N+1), analog zu getLatestSloEvaluationsForIds()
// (Phase 22) / listDependentsForServices() (Phase 23).
export async function listActionItemsForPostmortems(postmortemIds: number[]): Promise<Map<number, PostmortemActionItem[]>> {
  if (postmortemIds.length === 0) return new Map();
  const { rows } = await pool.query<ActionItemRow>(
    `SELECT ${ACTION_ITEM_COLUMNS} FROM incident_postmortem_action_items WHERE postmortem_id = ANY($1::bigint[]) ORDER BY created_at ASC`,
    [postmortemIds],
  );
  const byPostmortem = new Map<number, PostmortemActionItem[]>();
  for (const row of rows) {
    const item = mapActionItemRow(row);
    if (!byPostmortem.has(item.postmortemId)) byPostmortem.set(item.postmortemId, []);
    byPostmortem.get(item.postmortemId)!.push(item);
  }
  return byPostmortem;
}

export async function getActionItemById(id: number): Promise<PostmortemActionItem | undefined> {
  const { rows } = await pool.query<ActionItemRow>(`SELECT ${ACTION_ITEM_COLUMNS} FROM incident_postmortem_action_items WHERE id = $1`, [id]);
  return rows[0] ? mapActionItemRow(rows[0]) : undefined;
}

export interface CreateActionItemInput {
  postmortemId: number;
  description: string;
  assigneeId?: string | null;
  dueDate?: string | null;
  createdBy?: string | null;
}

// Race-sicher: sperrt die Eltern-Postmortem-Zeile (SELECT...FOR UPDATE,
// dasselbe etablierte Muster wie createSloIfUnderQuota() u.a.), BEVOR die
// aktuelle Action-Item-Anzahl gezaehlt wird - verhindert die explizit
// verbotene COUNT-dann-INSERT-TOCTOU-Race bei parallelen Anfragen gegen
// dasselbe Postmortem.
export async function createActionItemIfUnderLimit(input: CreateActionItemInput, maxItems: number): Promise<PostmortemActionItem | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT id FROM incident_postmortems WHERE id = $1 FOR UPDATE`, [input.postmortemId]);
    const { rows: countRows } = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM incident_postmortem_action_items WHERE postmortem_id = $1`,
      [input.postmortemId],
    );
    if (Number(countRows[0]?.count ?? 0) >= maxItems) {
      await client.query("ROLLBACK");
      return null;
    }
    const { rows } = await client.query<ActionItemRow>(
      `INSERT INTO incident_postmortem_action_items (postmortem_id, description, assignee_id, due_date, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${ACTION_ITEM_COLUMNS}`,
      [input.postmortemId, input.description, input.assigneeId ?? null, input.dueDate ?? null, input.createdBy ?? null],
    );
    await client.query("COMMIT");
    const row = rows[0];
    if (!row) throw new Error("Action Item konnte nicht angelegt werden");
    return mapActionItemRow(row);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export interface UpdateActionItemInput {
  description?: string;
  assigneeId?: string | null;
  dueDate?: string | null;
  status?: ActionItemStatus;
}

export async function updateActionItem(id: number, input: UpdateActionItemInput): Promise<PostmortemActionItem | undefined> {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (input.description !== undefined) {
    values.push(input.description);
    sets.push(`description = $${values.length}`);
  }
  if (input.assigneeId !== undefined) {
    values.push(input.assigneeId);
    sets.push(`assignee_id = $${values.length}`);
  }
  if (input.dueDate !== undefined) {
    values.push(input.dueDate);
    sets.push(`due_date = $${values.length}`);
  }
  if (input.status !== undefined) {
    values.push(input.status);
    sets.push(`status = $${values.length}`);
  }
  if (sets.length === 0) {
    return getActionItemById(id);
  }
  sets.push(`updated_at = now()`);
  values.push(id);
  const { rows } = await pool.query<ActionItemRow>(
    `UPDATE incident_postmortem_action_items SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING ${ACTION_ITEM_COLUMNS}`,
    values,
  );
  return rows[0] ? mapActionItemRow(rows[0]) : undefined;
}

export async function deleteActionItem(id: number): Promise<boolean> {
  const { rowCount } = await pool.query(`DELETE FROM incident_postmortem_action_items WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

export async function countActionItems(postmortemId: number): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM incident_postmortem_action_items WHERE postmortem_id = $1`,
    [postmortemId],
  );
  return Number(rows[0]?.count ?? 0);
}
