import { pool } from "./pool";
import type { ClaimIdempotencyKeyInput, IdempotencyRecord } from "../types/api-idempotency.types";

interface IdempotencyRow {
  id: string;
  organization_id: string;
  api_key_id: string;
  idempotency_key: string;
  request_hash: string;
  endpoint: string;
  method: string;
  status: "IN_PROGRESS" | "COMPLETED";
  response_status: number | null;
  response_body: unknown;
  created_at: string | Date;
  completed_at: string | Date | null;
  expires_at: string | Date;
}

const COLUMNS = `id, organization_id, api_key_id, idempotency_key, request_hash, endpoint, method, status, response_status, response_body, created_at, completed_at, expires_at`;

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}
function toIsoOrNull(value: string | Date | null): string | null {
  return value === null ? null : toIso(value);
}

function mapRow(row: IdempotencyRow): IdempotencyRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    apiKeyId: row.api_key_id,
    idempotencyKey: row.idempotency_key,
    requestHash: row.request_hash,
    endpoint: row.endpoint,
    method: row.method,
    status: row.status,
    responseStatus: row.response_status,
    responseBody: row.response_body,
    createdAt: toIso(row.created_at),
    completedAt: toIsoOrNull(row.completed_at),
    expiresAt: toIso(row.expires_at),
  };
}

// Auftragspunkt 4 "Idempotency-Datenbank" - atomarer Claim-Versuch ueber
// den Unique Index (organization_id, api_key_id, idempotency_key). Gibt
// undefined zurueck, wenn der Key bereits existiert (ON CONFLICT DO
// NOTHING) - der Aufrufer (middleware/idempotency.ts) muss dann per
// getIdempotencyRecord() entscheiden, ob es sich um einen Replay, einen
// Konflikt oder einen noch laufenden Request handelt. Race-sicher: bei
// zwei gleichzeitigen identischen Requests gewinnt genau einer den Claim.
export async function claimIdempotencyKey(input: ClaimIdempotencyKeyInput): Promise<IdempotencyRecord | undefined> {
  const { rows } = await pool.query<IdempotencyRow>(
    `INSERT INTO api_idempotency_keys (organization_id, api_key_id, idempotency_key, request_hash, endpoint, method)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (organization_id, api_key_id, idempotency_key) DO NOTHING
     RETURNING ${COLUMNS}`,
    [input.organizationId, input.apiKeyId, input.idempotencyKey, input.requestHash, input.endpoint, input.method],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function getIdempotencyRecord(organizationId: string, apiKeyId: string, idempotencyKey: string): Promise<IdempotencyRecord | undefined> {
  const { rows } = await pool.query<IdempotencyRow>(
    `SELECT ${COLUMNS} FROM api_idempotency_keys WHERE organization_id = $1 AND api_key_id = $2 AND idempotency_key = $3`,
    [organizationId, apiKeyId, idempotencyKey],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function completeIdempotencyKey(id: string, responseStatus: number, responseBody: unknown): Promise<void> {
  await pool.query(
    `UPDATE api_idempotency_keys SET status = 'COMPLETED', response_status = $2, response_body = $3, completed_at = now() WHERE id = $1`,
    [id, responseStatus, JSON.stringify(responseBody)],
  );
}

// Auftragspunkt 20 "Performance" - Bereinigung abgelaufener Eintraege,
// aufgerufen vom bestehenden Scheduler-Tick (core/monitor.ts), kein
// eigener Hintergrund-Poller.
export async function deleteExpiredIdempotencyKeys(): Promise<number> {
  const result = await pool.query(`DELETE FROM api_idempotency_keys WHERE expires_at < now()`);
  return result.rowCount ?? 0;
}
