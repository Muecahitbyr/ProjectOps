import { pool } from "./pool";
import type { ApiKey, CreateApiKeyInput } from "../types/api-key.types";

interface ApiKeyRow {
  id: string;
  organization_id: string;
  team_id: string | null;
  description: string;
  key_prefix: string;
  scopes: string[];
  expires_at: string | Date | null;
  last_used_at: string | Date | null;
  usage_count: string;
  created_by: string | null;
  revoked_at: string | Date | null;
  revoked_by: string | null;
  created_at: string | Date;
}

function toIsoOrNull(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function mapRow(row: ApiKeyRow): ApiKey {
  return {
    id: row.id,
    organizationId: row.organization_id,
    teamId: row.team_id,
    description: row.description,
    keyPrefix: row.key_prefix,
    scopes: row.scopes,
    expiresAt: toIsoOrNull(row.expires_at),
    lastUsedAt: toIsoOrNull(row.last_used_at),
    usageCount: Number(row.usage_count),
    createdBy: row.created_by,
    revokedAt: toIsoOrNull(row.revoked_at),
    revokedBy: row.revoked_by,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

const COLUMNS = `id, organization_id, team_id, description, key_prefix, scopes, expires_at, last_used_at, usage_count, created_by, revoked_at, revoked_by, created_at`;

// Phase 20 Auftragspunkt 13 "Externe API" - teamId/limit/offset additiv
// (bestehende Aufrufer mit nur organizationId bleiben unveraendert
// unlimitiert), analog zum Muster in automation-rules.repository.ts
// (Phase 18) fuer GET /api/v1/automation/rules.
export interface ListApiKeysFilters {
  organizationId?: string;
  teamId?: string;
  limit?: number;
  offset?: number;
}

function buildApiKeysWhere(filters: ListApiKeysFilters, values: unknown[]): string {
  const conditions: string[] = [];
  if (filters.organizationId) {
    values.push(filters.organizationId);
    conditions.push(`organization_id = $${values.length}`);
  }
  if (filters.teamId) {
    values.push(filters.teamId);
    conditions.push(`team_id = $${values.length}`);
  }
  return conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
}

export async function listApiKeys(filters: ListApiKeysFilters | string = {}): Promise<ApiKey[]> {
  const normalized: ListApiKeysFilters = typeof filters === "string" ? { organizationId: filters } : filters;
  const values: unknown[] = [];
  const where = buildApiKeysWhere(normalized, values);

  if (normalized.limit === undefined) {
    const { rows } = await pool.query<ApiKeyRow>(`SELECT ${COLUMNS} FROM api_keys ${where} ORDER BY created_at DESC`, values);
    return rows.map(mapRow);
  }

  values.push(normalized.limit);
  const limitIndex = values.length;
  values.push(normalized.offset ?? 0);
  const offsetIndex = values.length;
  const { rows } = await pool.query<ApiKeyRow>(
    `SELECT ${COLUMNS} FROM api_keys ${where} ORDER BY created_at DESC LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
    values,
  );
  return rows.map(mapRow);
}

export async function countApiKeys(filters: ListApiKeysFilters = {}): Promise<number> {
  const values: unknown[] = [];
  const where = buildApiKeysWhere(filters, values);
  const { rows } = await pool.query<{ count: string }>(`SELECT COUNT(*) AS count FROM api_keys ${where}`, values);
  return Number(rows[0]?.count ?? 0);
}

export async function getApiKeyById(id: string): Promise<ApiKey | undefined> {
  const { rows } = await pool.query<ApiKeyRow>(`SELECT ${COLUMNS} FROM api_keys WHERE id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function createApiKey(input: CreateApiKeyInput, keyHash: string, keyPrefix: string): Promise<ApiKey> {
  const { rows } = await pool.query<ApiKeyRow>(
    `INSERT INTO api_keys (organization_id, team_id, description, key_hash, key_prefix, scopes, expires_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${COLUMNS}`,
    [
      input.organizationId,
      input.teamId ?? null,
      input.description,
      keyHash,
      keyPrefix,
      input.scopes ?? [],
      input.expiresAt ?? null,
      input.createdBy ?? null,
    ],
  );
  const row = rows[0];
  if (!row) {
    throw new Error("API Key konnte nicht erstellt werden");
  }
  return mapRow(row);
}

// Auftragspunkt 7 "API Quotas" (maxApiKeys pro Plan) - nur nicht widerrufene
// Keys zaehlen gegen das Limit, abgelaufene aber (noch) nicht widerrufene
// Keys ebenfalls (sie belegen bis zur expliziten Bereinigung weiter einen
// Slot, analog zu vielen kommerziellen API-Plattformen). Bleibt fuer Stellen
// erhalten, die nur den aktuellen Stand anzeigen wollen (z.B. Frontend-
// Anzeige) - fuer die tatsaechliche Durchsetzung beim Erstellen siehe
// createApiKeyIfUnderQuota() unten (race-sicher).
export async function countActiveApiKeys(organizationId: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM api_keys WHERE organization_id = $1 AND revoked_at IS NULL`,
    [organizationId],
  );
  return Number(rows[0]?.count ?? 0);
}

// Phase 20 Auftragspunkt 15/18 "Rate Limit/Quota Interaction"/"Race
// Smoke Test" - ECHTER, waehrend der Live-E2E-Tests gefundener Bug: die
// bisherige Reihenfolge "countActiveApiKeys() pruefen, DANN createApiKey()
// einfuegen" (zwei getrennte Statements, siehe routes/api-keys.routes.ts
// und routes/v1/api-keys.routes.ts) ist eine klassische TOCTOU-Race - bei N
// gleichzeitigen Requests sehen ALLE denselben (veralteten) COUNT, bevor
// irgendeiner sein INSERT committet, wodurch das maxApiKeys-Limit beliebig
// ueberschritten werden kann (im Test: 5 parallele Requests bei 2 freien
// Slots erzeugten 5 neue Keys statt 2). Behoben durch eine Transaktion mit
// "SELECT ... FOR UPDATE" auf die organizations-Zeile: das serialisiert ALLE
// gleichzeitigen Erstellungsversuche DERSELBEN Organisation (der zweite
// Aufruf wartet, bis der erste committet/rollbackt hat), COUNT und INSERT
// laufen danach garantiert konsistent. Gibt null zurueck, wenn das Limit
// erreicht ist (Aufrufer wandelt das in 409 CONFLICT um) statt eine
// Exception zu werfen - kein Fehlerfall, ein erwartetes Ergebnis.
export async function createApiKeyIfUnderQuota(
  input: CreateApiKeyInput,
  keyHash: string,
  keyPrefix: string,
  maxActiveKeys: number,
): Promise<ApiKey | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT id FROM organizations WHERE id = $1 FOR UPDATE`, [input.organizationId]);
    const { rows: countRows } = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM api_keys WHERE organization_id = $1 AND revoked_at IS NULL`,
      [input.organizationId],
    );
    if (Number(countRows[0]?.count ?? 0) >= maxActiveKeys) {
      await client.query("ROLLBACK");
      return null;
    }

    const { rows } = await client.query<ApiKeyRow>(
      `INSERT INTO api_keys (organization_id, team_id, description, key_hash, key_prefix, scopes, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${COLUMNS}`,
      [
        input.organizationId,
        input.teamId ?? null,
        input.description,
        keyHash,
        keyPrefix,
        input.scopes ?? [],
        input.expiresAt ?? null,
        input.createdBy ?? null,
      ],
    );
    await client.query("COMMIT");
    const row = rows[0];
    if (!row) {
      throw new Error("API Key konnte nicht erstellt werden");
    }
    return mapRow(row);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Phase 20 Auftragspunkt 1/4 "API Key Lifecycle"/"Key Revocation" -
// revokedBy ist optional (null bei Widerruf durch einen ANDEREN API-Key
// ueber die externe API, siehe routes/v1/api-keys.routes.ts - dort gibt es
// keine Benutzer-Identitaet, nur actorApiKeyId in den Audit-Metadaten).
// "WHERE revoked_at IS NULL" bleibt die einzige Bedingung, unter der das
// UPDATE greift - ein bereits widerrufener Key kann nicht "erneut" oder
// "staerker" widerrufen werden (kein Reaktivierungspfad, keine Race
// Condition: die Bedingung ist Teil desselben atomaren UPDATE-Statements,
// zwei gleichzeitige Revoke-Aufrufe koennen sich nicht gegenseitig
// ueberschreiben - nur der erste erfolgreiche findet eine Zeile).
export async function revokeApiKey(id: string, revokedBy?: string): Promise<ApiKey | undefined> {
  const { rows } = await pool.query<ApiKeyRow>(
    `UPDATE api_keys SET revoked_at = now(), revoked_by = $2 WHERE id = $1 AND revoked_at IS NULL RETURNING ${COLUMNS}`,
    [id, revokedBy ?? null],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

// Auftragspunkt 8 "API-Key Management" ("Rotate") - derselbe Datensatz
// (id/description/scopes/team/created_by bleiben unveraendert, damit
// Usage-Historie/Audit-Trail dieses Keys nicht abreissen), nur Hash+Prefix
// werden ausgetauscht (dasselbe Muster wie rotateServiceAccountSecret,
// Phase 15). Der alte Klartext-Key ist danach sofort ungueltig, da
// findApiKeyByHash() ihn nicht mehr findet.
export async function rotateApiKeyHash(id: string, keyHash: string, keyPrefix: string): Promise<ApiKey | undefined> {
  const { rows } = await pool.query<ApiKeyRow>(
    `UPDATE api_keys SET key_hash = $2, key_prefix = $3 WHERE id = $1 AND revoked_at IS NULL RETURNING ${COLUMNS}`,
    [id, keyHash, keyPrefix],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

// Phase 16 "Echte API-Key-Authentifizierung": bewusst OHNE
// "revoked_at IS NULL"/Ablauf-Filter in der SQL-Abfrage - die aufrufende
// Middleware (middleware/api-key-auth.ts) muss zwischen "Key existiert
// nicht", "Key widerrufen" und "Key abgelaufen" unterscheiden koennen, um
// im Audit-Log den korrekten Grund zu erfassen (Auftragspunkt 12). Die
// eigentliche Ablehnung findet weiterhin in der Middleware statt, nicht
// hier.
export async function findApiKeyByHash(keyHash: string): Promise<ApiKey | undefined> {
  const { rows } = await pool.query<ApiKeyRow>(`SELECT ${COLUMNS} FROM api_keys WHERE key_hash = $1`, [keyHash]);
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function recordApiKeyUsage(id: string): Promise<void> {
  await pool.query(`UPDATE api_keys SET last_used_at = now(), usage_count = usage_count + 1 WHERE id = $1`, [id]);
}
