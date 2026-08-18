import { pool } from "./pool";
import type { CreateMaintenanceWindowInput, MaintenanceWindow } from "../types/maintenance.types";

interface MaintenanceWindowRow {
  id: number;
  project_id: string;
  starts_at: string | Date;
  ends_at: string | Date;
  reason: string;
  created_by: string | null;
  created_at: string | Date;
  change_id: string | number | null;
}

const MAINTENANCE_COLUMNS = `id, project_id, starts_at, ends_at, reason, created_by, created_at, change_id`;

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function mapRow(row: MaintenanceWindowRow): MaintenanceWindow {
  const startsAt = toIsoString(row.starts_at);
  const endsAt = toIsoString(row.ends_at);
  const now = Date.now();
  return {
    id: row.id,
    projectId: row.project_id,
    startsAt,
    endsAt,
    reason: row.reason,
    createdBy: row.created_by,
    createdAt: toIsoString(row.created_at),
    active: new Date(startsAt).getTime() <= now && now < new Date(endsAt).getTime(),
    changeId: row.change_id === null ? null : Number(row.change_id),
  };
}

export async function listMaintenanceWindows(options: { projectId?: string; changeId?: number } = {}): Promise<MaintenanceWindow[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (options.projectId) {
    values.push(options.projectId);
    conditions.push(`project_id = $${values.length}`);
  }
  if (options.changeId !== undefined) {
    values.push(options.changeId);
    conditions.push(`change_id = $${values.length}`);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const { rows } = await pool.query<MaintenanceWindowRow>(
    `SELECT ${MAINTENANCE_COLUMNS} FROM maintenance_windows ${where} ORDER BY starts_at DESC`,
    values,
  );
  return rows.map(mapRow);
}

export async function getMaintenanceWindowById(id: number): Promise<MaintenanceWindow | undefined> {
  const { rows } = await pool.query<MaintenanceWindowRow>(
    `SELECT ${MAINTENANCE_COLUMNS} FROM maintenance_windows WHERE id = $1`,
    [id],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

// Unveraendert seit Phase 9 - OHNE Ueberschneidungspruefung, bewusst so
// belassen fuer den Restore-Anwendungsfall (backup/backup-service.ts):
// beim Wiederherstellen eines Backups werden historische Fenster 1:1
// uebernommen, eine Ueberschneidungspruefung waere dort fachlich falsch
// (die Daten waren zum Sicherungszeitpunkt bereits so gueltig) und
// unnoetig langsam (Transaktion pro Zeile in einer Schleife). Der echte
// Nutzer-Erstellungspfad (routes/maintenance.routes.ts, core/change-
// lifecycle.ts) verwendet stattdessen createMaintenanceWindowIfNoOverlap
// unten.
export async function createMaintenanceWindow(input: CreateMaintenanceWindowInput): Promise<MaintenanceWindow> {
  const { rows } = await pool.query<MaintenanceWindowRow>(
    `INSERT INTO maintenance_windows (project_id, starts_at, ends_at, reason, created_by, change_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${MAINTENANCE_COLUMNS}`,
    [input.projectId, input.startsAt, input.endsAt, input.reason, input.createdBy ?? null, input.changeId ?? null],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("Wartungsfenster konnte nicht angelegt werden");
  }
  return mapRow(row);
}

// Phase 28 Auftragspunkt 3 "Ueberschneidungen korrekt behandeln" - race-
// sicher per SELECT...FOR UPDATE auf die Projekt-Zeile, exakt dasselbe
// Transaktionsmuster wie createOverrideIfNoOverlap (Phase 24, on_call_
// overrides): zwei gleichzeitige Erstellungsversuche fuer sich
// ueberschneidende Fenster desselben Projekts koennen nicht beide gewinnen.
// Gibt null zurueck (statt zu werfen) bei einer echten Ueberschneidung -
// der Aufrufer entscheidet ueber die Fehlermeldung.
export async function createMaintenanceWindowIfNoOverlap(input: CreateMaintenanceWindowInput): Promise<MaintenanceWindow | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT id FROM projects WHERE id = $1 FOR UPDATE`, [input.projectId]);
    const { rows: overlapRows } = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM maintenance_windows WHERE project_id = $1 AND starts_at < $3 AND ends_at > $2`,
      [input.projectId, input.startsAt, input.endsAt],
    );
    if (Number(overlapRows[0]?.count ?? 0) > 0) {
      await client.query("ROLLBACK");
      return null;
    }

    const { rows } = await client.query<MaintenanceWindowRow>(
      `INSERT INTO maintenance_windows (project_id, starts_at, ends_at, reason, created_by, change_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${MAINTENANCE_COLUMNS}`,
      [input.projectId, input.startsAt, input.endsAt, input.reason, input.createdBy ?? null, input.changeId ?? null],
    );
    await client.query("COMMIT");
    const row = rows[0];
    if (!row) {
      throw new Error("Wartungsfenster konnte nicht angelegt werden");
    }
    return mapRow(row);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteMaintenanceWindow(id: number): Promise<boolean> {
  const result = await pool.query(`DELETE FROM maintenance_windows WHERE id = $1`, [id]);
  return (result.rowCount ?? 0) > 0;
}

// Phase 28 - schliesst ein automatisch erzeugtes Fenster sofort, wenn der
// zugehoerige Change abgeschlossen/abgebrochen wird (core/change-
// lifecycle.ts), statt bis zum urspruenglich geplanten (ggf. viel
// spaeteren Fallback-)Ende zu warten. WHERE ends_at > now() ist selbst
// bereits idempotent/race-sicher: ein zweiter, gleichzeitiger Aufruf trifft
// keine Zeile mehr (kein Fehler, nur 0 betroffene Zeilen).
export async function endMaintenanceWindowNow(id: number): Promise<MaintenanceWindow | undefined> {
  const { rows } = await pool.query<MaintenanceWindowRow>(
    `UPDATE maintenance_windows SET ends_at = now() WHERE id = $1 AND ends_at > now() RETURNING ${MAINTENANCE_COLUMNS}`,
    [id],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

// Zentrale Abfrage fuer den Scheduler (core/monitor.ts,
// alerts/alert-evaluator.ts) - "ist fuer dieses Projekt JETZT ein
// Wartungsfenster aktiv?". Wird pro Projekt und Scheduler-Tick aufgerufen,
// daher ueber den vorhandenen Index (project_id, starts_at, ends_at)
// effizient (Range-Check statt vollem Tabellenscan). Unveraendert seit
// Phase 9 - deckt jetzt automatisch auch Change-erzeugte Fenster ab, ohne
// dass diese Funktion selbst etwas von Changes wissen muss.
export async function getActiveMaintenanceWindow(projectId: string): Promise<MaintenanceWindow | undefined> {
  const { rows } = await pool.query<MaintenanceWindowRow>(
    `SELECT ${MAINTENANCE_COLUMNS} FROM maintenance_windows
     WHERE project_id = $1 AND starts_at <= now() AND ends_at > now()
     ORDER BY starts_at DESC LIMIT 1`,
    [projectId],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

// Phase 28 Auftragspunkt 4 "geplante Auswirkungen muessen erkannt werden
// koennen" / "nachvollziehbar kennzeichnen" - liefert die waehrend eines
// Fensters aufgetretenen Check-Fehlschlaege AUS DEN BEREITS BESTEHENDEN
// check_results (Phase 1), ohne neue Speicherung: "check_results wird
// IMMER geschrieben" (siehe core/monitor.ts) bedeutet, das Rohsignal geht
// waehrend eines Wartungsfensters nie verloren, nur die Incident-
// Eroeffnung wird unterdrueckt - diese Abfrage macht das nachtraeglich
// nachvollziehbar sichtbar, statt es "zu verschlucken".
export interface SuppressedCheckFailure {
  checkId: string;
  status: string;
  error: string | null;
  checkedAt: string;
}

export async function listSuppressedFailuresForWindow(window: Pick<MaintenanceWindow, "projectId" | "startsAt" | "endsAt">): Promise<SuppressedCheckFailure[]> {
  const { rows } = await pool.query<{ check_id: string; status: string; error: string | null; checked_at: string | Date }>(
    `SELECT cr.check_id, cr.status, cr.error, cr.checked_at
     FROM check_results cr JOIN checks c ON c.id = cr.check_id
     WHERE c.project_id = $1 AND cr.checked_at >= $2 AND cr.checked_at < $3 AND cr.status IN ('ERROR', 'OFFLINE')
     ORDER BY cr.checked_at DESC LIMIT 200`,
    [window.projectId, window.startsAt, window.endsAt],
  );
  return rows.map((r) => ({ checkId: r.check_id, status: r.status, error: r.error, checkedAt: toIsoString(r.checked_at) }));
}
