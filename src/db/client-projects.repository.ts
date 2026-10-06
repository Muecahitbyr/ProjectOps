import { pool } from "./pool";
import { decryptSecret, encryptSecret } from "../core/crypto";
import { logger } from "../core/logger";
import type { ClientProject, CreateClientProjectInput, UpdateClientProjectInput } from "../types/client-project.types";

interface ClientProjectRow {
  id: string | number;
  name: string;
  admin_login_url: string | null;
  admin_login_username: string | null;
  admin_login_password: string | null;
  notes: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

// Nutzerwunsch 2026-10-07: "gesichert, aber ich will es trotzdem einsehen
// koennen" - admin_login_password liegt daher nicht im Klartext in der DB,
// sondern echt verschluesselt (AES-256-GCM, core/crypto.ts - derselbe
// Mechanismus, der dort bereits fuer Webhook-Secrets genutzt wird), und
// wird erst beim Lesen wieder entschluesselt. Kein Hash (irreversibel) -
// der Zweck ist Einsicht, nicht Vergleich.
function encryptPasswordOrNull(password: string | null | undefined): string | null {
  return password ? encryptSecret(password) : null;
}

// Schlaegt die Entschluesselung fehl (z.B. WEBHOOK_SECRET_ENCRYPTION_KEY
// wurde geaendert/fehlt), soll das nicht die ganze Projektliste mit einem
// 500 abschiessen - stattdessen null (Feld gilt dann als "nicht gesetzt")
// und eine Server-Log-Zeile zur Diagnose.
function decryptPasswordOrNull(encrypted: string | null): string | null {
  if (!encrypted) return null;
  try {
    return decryptSecret(encrypted);
  } catch (err) {
    logger.error("Admin-Login-Passwort konnte nicht entschluesselt werden", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// BIGSERIAL-Id kommt vom pg-Treiber als String zurueck - explizit zu Number
// gewandelt (siehe CLAUDE.md BIGSERIAL/BIGINT-Konvention).
function mapRow(row: ClientProjectRow): ClientProject {
  return {
    id: Number(row.id),
    name: row.name,
    adminLoginUrl: row.admin_login_url,
    adminLoginUsername: row.admin_login_username,
    adminLoginPassword: decryptPasswordOrNull(row.admin_login_password),
    notes: row.notes,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

const COLUMNS = `id, name, admin_login_url, admin_login_username, admin_login_password, notes, created_at, updated_at`;

export async function listClientProjects(): Promise<ClientProject[]> {
  const { rows } = await pool.query<ClientProjectRow>(`SELECT ${COLUMNS} FROM client_projects ORDER BY name ASC`);
  return rows.map(mapRow);
}

// Case-insensitiv/trim-tolerant - fuer den Unique-Pre-Check in den Routen
// (dieselbe Konvention wie der 23505-Pre-Check bei services.project_id,
// siehe platform-services.routes.ts: ein roher Postgres-Unique-Violation-
// Fehler soll nie als 500 beim Client ankommen).
export async function getClientProjectByName(name: string): Promise<ClientProject | undefined> {
  const { rows } = await pool.query<ClientProjectRow>(
    `SELECT ${COLUMNS} FROM client_projects WHERE lower(trim(name)) = lower(trim($1))`,
    [name],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function createClientProject(input: CreateClientProjectInput): Promise<ClientProject> {
  const { rows } = await pool.query<ClientProjectRow>(
    `INSERT INTO client_projects (name, admin_login_url, admin_login_username, admin_login_password, notes)
     VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNS}`,
    [input.name, input.adminLoginUrl ?? null, input.adminLoginUsername ?? null, encryptPasswordOrNull(input.adminLoginPassword), input.notes ?? null],
  );
  return mapRow(rows[0]!);
}

export async function updateClientProject(id: number, input: UpdateClientProjectInput): Promise<ClientProject | undefined> {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (input.name !== undefined) {
    values.push(input.name);
    sets.push(`name = $${values.length}`);
  }
  if (input.adminLoginUrl !== undefined) {
    values.push(input.adminLoginUrl);
    sets.push(`admin_login_url = $${values.length}`);
  }
  if (input.adminLoginUsername !== undefined) {
    values.push(input.adminLoginUsername);
    sets.push(`admin_login_username = $${values.length}`);
  }
  if (input.adminLoginPassword !== undefined) {
    values.push(encryptPasswordOrNull(input.adminLoginPassword));
    sets.push(`admin_login_password = $${values.length}`);
  }
  if (input.notes !== undefined) {
    values.push(input.notes);
    sets.push(`notes = $${values.length}`);
  }
  if (sets.length === 0) {
    const { rows } = await pool.query<ClientProjectRow>(`SELECT ${COLUMNS} FROM client_projects WHERE id = $1`, [id]);
    return rows[0] ? mapRow(rows[0]) : undefined;
  }
  sets.push(`updated_at = now()`);
  values.push(id);

  const { rows } = await pool.query<ClientProjectRow>(
    `UPDATE client_projects SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING ${COLUMNS}`,
    values,
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function deleteClientProject(id: number): Promise<ClientProject | undefined> {
  const { rows } = await pool.query<ClientProjectRow>(`DELETE FROM client_projects WHERE id = $1 RETURNING ${COLUMNS}`, [id]);
  return rows[0] ? mapRow(rows[0]) : undefined;
}
