import { pool } from "./pool";
import type { CreateNisanGuestInput, NisanGuest, NisanGuestStatus, NisanHost, UpdateNisanGuestInput } from "../types/nisan.types";

interface NisanGuestRow {
  id: string | number;
  host: NisanHost;
  name: string;
  status: NisanGuestStatus;
  created_at: string | Date;
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

// BIGSERIAL-Id kommt vom pg-Treiber als String zurueck - explizit zu Number
// gewandelt (siehe CLAUDE.md BIGSERIAL/BIGINT-Konvention).
function mapRow(row: NisanGuestRow): NisanGuest {
  return {
    id: Number(row.id),
    host: row.host,
    name: row.name,
    status: row.status,
    createdAt: toIsoString(row.created_at),
  };
}

const COLUMNS = `id, host, name, status, created_at`;

export async function listNisanGuests(): Promise<NisanGuest[]> {
  const { rows } = await pool.query<NisanGuestRow>(`SELECT ${COLUMNS} FROM nisan_guests ORDER BY created_at ASC`);
  return rows.map(mapRow);
}

export async function createNisanGuest(input: CreateNisanGuestInput): Promise<NisanGuest> {
  const { rows } = await pool.query<NisanGuestRow>(
    `INSERT INTO nisan_guests (host, name, status) VALUES ($1, $2, $3) RETURNING ${COLUMNS}`,
    [input.host, input.name, input.status ?? "MAYBE"],
  );
  return mapRow(rows[0]!);
}

export async function updateNisanGuest(id: number, input: UpdateNisanGuestInput): Promise<NisanGuest | undefined> {
  const { rows } = await pool.query<NisanGuestRow>(
    `UPDATE nisan_guests SET status = $1 WHERE id = $2 RETURNING ${COLUMNS}`,
    [input.status, id],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function deleteNisanGuest(id: number): Promise<NisanGuest | undefined> {
  const { rows } = await pool.query<NisanGuestRow>(`DELETE FROM nisan_guests WHERE id = $1 RETURNING ${COLUMNS}`, [id]);
  return rows[0] ? mapRow(rows[0]) : undefined;
}
