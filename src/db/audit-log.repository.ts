import { pool } from "./pool";
import type { AuditCategory, AuditLogEntry, AuditSeverity } from "../types/audit.types";

interface AuditLogRow {
  id: number;
  user_id: string | null;
  action: string;
  category: AuditCategory;
  severity: AuditSeverity;
  project_id: string | null;
  message: string;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string | Date;
}

const COLUMNS = `id, user_id, action, category, severity, project_id, message, metadata, ip_address, created_at`;

function mapRow(row: AuditLogRow): AuditLogEntry {
  return {
    id: row.id,
    userId: row.user_id,
    action: row.action,
    category: row.category,
    severity: row.severity,
    projectId: row.project_id,
    message: row.message,
    metadata: row.metadata,
    ipAddress: row.ip_address,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

export interface CreateAuditLogInput {
  userId?: string;
  action: string;
  category: AuditCategory;
  severity?: AuditSeverity;
  projectId?: string;
  message: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

export async function createAuditLogEntry(input: CreateAuditLogInput): Promise<AuditLogEntry> {
  const { rows } = await pool.query<AuditLogRow>(
    `INSERT INTO audit_log (user_id, action, category, severity, project_id, message, metadata, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${COLUMNS}`,
    [
      input.userId ?? null,
      input.action,
      input.category,
      input.severity ?? "INFO",
      input.projectId ?? null,
      input.message,
      input.metadata ? JSON.stringify(input.metadata) : null,
      input.ipAddress ?? null,
    ],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Audit-Eintrag konnte nicht gespeichert werden");
  }
  return mapRow(row);
}

export interface ListAuditLogFilters {
  userId?: string;
  projectId?: string;
  category?: AuditCategory;
  severity?: AuditSeverity;
  from?: string;
  to?: string;
  // Phase 28 (Fortsetzung) Auftragspunkt 8 "Change Timeline" - filtert auf
  // metadata.changeId (JSONB), gesetzt von jeder Change-Lifecycle-Aktion
  // in routes/changes.routes.ts. Vergleich als Text (->>), da metadata.
  // changeId als JSON-Zahl gespeichert wird, aber die Route eine echte
  // Zahl liefert - "->>": text-Extraktion vermeidet einen JSONB-Typ-
  // Mismatch beim Vergleich.
  changeId?: number;
  limit: number;
}

export async function listAuditLog(filters: ListAuditLogFilters): Promise<AuditLogEntry[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  const add = (sql: string, value: unknown): void => {
    values.push(value);
    conditions.push(sql.replace("$$", `$${values.length}`));
  };

  if (filters.userId) add("user_id = $$", filters.userId);
  if (filters.projectId) add("project_id = $$", filters.projectId);
  if (filters.category) add("category = $$", filters.category);
  if (filters.severity) add("severity = $$", filters.severity);
  if (filters.from) add("created_at >= $$", filters.from);
  if (filters.to) add("created_at <= $$", filters.to);
  if (filters.changeId !== undefined) add("metadata->>'changeId' = $$", String(filters.changeId));

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  values.push(filters.limit);

  const { rows } = await pool.query<AuditLogRow>(
    `SELECT ${COLUMNS} FROM audit_log ${where} ORDER BY created_at DESC LIMIT $${values.length}`,
    values,
  );
  return rows.map(mapRow);
}

// Phase 44 "Enterprise Priority Queue Acknowledgment Governance" -
// Auftragspunkt "bestehende Audit-Infrastruktur wiederverwenden, keine
// zweite History-Tabelle": der aktuelle Bestaetigungszustand eines
// Priority-Queue-Eintrags wird NICHT separat gespeichert, sondern live aus
// dem juengsten passenden audit_log-Eintrag je Projekt abgeleitet. EINE
// batched Abfrage (DISTINCT ON) fuer eine ganze Projekt-Liste statt einer
// Einzelabfrage pro Projekt (Auftragspunkt "keine unnoetigen
// Datenbankabfragen") - nutzt idx_audit_log_project_id (project_id,
// created_at DESC), das bereits fuer listAuditLog() existiert.
export async function getLatestAuditEntriesForProjects(projectIds: string[], actions: string[]): Promise<Map<string, AuditLogEntry>> {
  if (projectIds.length === 0 || actions.length === 0) return new Map();
  const { rows } = await pool.query<AuditLogRow>(
    `SELECT DISTINCT ON (project_id) ${COLUMNS}
     FROM audit_log
     WHERE project_id = ANY($1) AND action = ANY($2)
     ORDER BY project_id, created_at DESC`,
    [projectIds, actions],
  );
  return new Map(rows.map((row) => [row.project_id as string, mapRow(row)]));
}

// Phase 45 "Enterprise Acknowledgment Outcome & Continuous Improvement
// Intelligence" - anders als getLatestAuditEntriesForProjects() (nur der
// JUENGSTE Eintrag je Projekt, fuer den "aktuellen" Zustand in Phase 44)
// wird hier die VOLLSTAENDIGE chronologische Historie mehrerer Aktionsarten
// je Projekt benoetigt, um Bestaetigungen mit ihren jeweils NACHFOLGENDEN
// Statuswechseln zu verknuepfen. Ein "since"-Zeitfenster (statt eines
// Limits) begrenzt die Ergebnismenge, identisch zur bestehenden
// range-basierten Fensterkonvention (RESILIENCE_RANGE_HOURS) statt einer
// willkuerlichen Zeilenzahl - nutzt denselben idx_audit_log_project_id
// (project_id, created_at) wie getLatestAuditEntriesForProjects() oben.
export async function listAuditEntriesForProjectActions(projectIds: string[], actions: string[], sinceIso: string): Promise<AuditLogEntry[]> {
  if (projectIds.length === 0 || actions.length === 0) return [];
  const { rows } = await pool.query<AuditLogRow>(
    `SELECT ${COLUMNS}
     FROM audit_log
     WHERE project_id = ANY($1) AND action = ANY($2) AND created_at >= $3
     ORDER BY project_id, created_at ASC`,
    [projectIds, actions, sinceIso],
  );
  return rows.map(mapRow);
}
