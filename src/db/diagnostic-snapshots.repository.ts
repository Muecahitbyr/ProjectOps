import { pool } from "./pool";
import type { DiagnosticSnapshot, DiagnosticSnapshotContent } from "../types/diagnostic-snapshot.types";

interface DiagnosticSnapshotRow {
  id: number;
  project_id: string;
  incident_id: number | null;
  health_score: number;
  snapshot: DiagnosticSnapshotContent;
  created_at: string | Date;
}

function mapRow(row: DiagnosticSnapshotRow): DiagnosticSnapshot {
  return {
    id: row.id,
    projectId: row.project_id,
    incidentId: row.incident_id,
    healthScore: row.health_score,
    snapshot: row.snapshot,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

export interface CreateDiagnosticSnapshotInput {
  projectId: string;
  incidentId?: number;
  healthScore: number;
  snapshot: DiagnosticSnapshotContent;
}

export async function createDiagnosticSnapshot(input: CreateDiagnosticSnapshotInput): Promise<DiagnosticSnapshot> {
  const { rows } = await pool.query<DiagnosticSnapshotRow>(
    `INSERT INTO diagnostic_snapshots (project_id, incident_id, health_score, snapshot)
     VALUES ($1, $2, $3, $4)
     RETURNING id, project_id, incident_id, health_score, snapshot, created_at`,
    [input.projectId, input.incidentId ?? null, input.healthScore, JSON.stringify(input.snapshot)],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Diagnostic Snapshot konnte nicht gespeichert werden");
  }
  return mapRow(row);
}

export async function listDiagnosticSnapshots(options: { projectId?: string; limit?: number } = {}): Promise<DiagnosticSnapshot[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (options.projectId) {
    values.push(options.projectId);
    conditions.push(`project_id = $${values.length}`);
  }
  values.push(options.limit ?? 50);
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await pool.query<DiagnosticSnapshotRow>(
    `SELECT id, project_id, incident_id, health_score, snapshot, created_at
     FROM diagnostic_snapshots ${where}
     ORDER BY created_at DESC LIMIT $${values.length}`,
    values,
  );
  return rows.map(mapRow);
}

export async function getDiagnosticSnapshotById(id: number): Promise<DiagnosticSnapshot | undefined> {
  const { rows } = await pool.query<DiagnosticSnapshotRow>(
    `SELECT id, project_id, incident_id, health_score, snapshot, created_at FROM diagnostic_snapshots WHERE id = $1`,
    [id],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}
