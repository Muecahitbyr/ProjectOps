import { pool } from "./pool";
import type { AcquisitionCompany, AcquisitionStage, CreateAcquisitionCompanyInput, UpdateAcquisitionCompanyInput } from "../types/acquisition.types";

interface AcquisitionCompanyRow {
  id: string | number;
  name: string;
  website_built: boolean;
  called: boolean;
  wants_website: boolean | null;
  website_sent: boolean;
  confirmed_after_viewing: boolean | null;
  planning_done: boolean;
  implementation_done: boolean;
  live: boolean;
  created_at: string | Date;
  updated_at: string | Date;
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

// Zwei unabhaengige Ja/Nein-Entscheidungen, BEIDE mit "Nein" als Endzustand
// (dieselbe NO_WEBSITE-Liste - fachlich dasselbe Ergebnis: kein Auftrag).
// "Ja" bei wants_website ist KEIN Endzustand - danach folgt erst das
// Verschicken der Webseite und die zweite Entscheidung, siehe
// AcquisitionStage-Kommentar in acquisition.types.ts.
function deriveStage(row: AcquisitionCompanyRow): AcquisitionStage {
  if (!row.website_built) return "WEBSITE_BUILDING";
  if (!row.called) return "CALLING";
  if (row.wants_website === null) return "DECISION_PENDING";
  if (row.wants_website === false) return "NO_WEBSITE";
  if (!row.website_sent) return "SENDING_WEBSITE";
  if (row.confirmed_after_viewing === null) return "CONFIRMATION_PENDING";
  if (row.confirmed_after_viewing === false) return "NO_WEBSITE";
  if (!row.planning_done) return "PLANNING";
  if (!row.implementation_done) return "IMPLEMENTATION";
  if (!row.live) return "LIVE_PENDING";
  return "DONE";
}

// BIGSERIAL-Id kommt vom pg-Treiber als String zurueck - explizit zu Number
// gewandelt (siehe CLAUDE.md BIGSERIAL/BIGINT-Konvention).
function mapRow(row: AcquisitionCompanyRow): AcquisitionCompany {
  return {
    id: Number(row.id),
    name: row.name,
    websiteBuilt: row.website_built,
    called: row.called,
    wantsWebsite: row.wants_website,
    websiteSent: row.website_sent,
    confirmedAfterViewing: row.confirmed_after_viewing,
    planningDone: row.planning_done,
    implementationDone: row.implementation_done,
    live: row.live,
    stage: deriveStage(row),
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

const COLUMNS = `id, name, website_built, called, wants_website, website_sent, confirmed_after_viewing, planning_done, implementation_done, live, created_at, updated_at`;

export async function listAcquisitionCompanies(): Promise<AcquisitionCompany[]> {
  const { rows } = await pool.query<AcquisitionCompanyRow>(`SELECT ${COLUMNS} FROM acquisition_companies ORDER BY created_at ASC`);
  return rows.map(mapRow);
}

export async function getAcquisitionCompanyById(id: number): Promise<AcquisitionCompany | undefined> {
  const { rows } = await pool.query<AcquisitionCompanyRow>(`SELECT ${COLUMNS} FROM acquisition_companies WHERE id = $1`, [id]);
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function createAcquisitionCompany(input: CreateAcquisitionCompanyInput): Promise<AcquisitionCompany> {
  const { rows } = await pool.query<AcquisitionCompanyRow>(
    `INSERT INTO acquisition_companies (name) VALUES ($1) RETURNING ${COLUMNS}`,
    [input.name],
  );
  return mapRow(rows[0]!);
}

export async function updateAcquisitionCompany(id: number, input: UpdateAcquisitionCompanyInput): Promise<AcquisitionCompany | undefined> {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (input.name !== undefined) {
    values.push(input.name);
    sets.push(`name = $${values.length}`);
  }
  if (input.websiteBuilt !== undefined) {
    values.push(input.websiteBuilt);
    sets.push(`website_built = $${values.length}`);
  }
  if (input.called !== undefined) {
    values.push(input.called);
    sets.push(`called = $${values.length}`);
  }
  if (input.wantsWebsite !== undefined) {
    values.push(input.wantsWebsite);
    sets.push(`wants_website = $${values.length}`);
  }
  if (input.websiteSent !== undefined) {
    values.push(input.websiteSent);
    sets.push(`website_sent = $${values.length}`);
  }
  if (input.confirmedAfterViewing !== undefined) {
    values.push(input.confirmedAfterViewing);
    sets.push(`confirmed_after_viewing = $${values.length}`);
  }
  if (input.planningDone !== undefined) {
    values.push(input.planningDone);
    sets.push(`planning_done = $${values.length}`);
  }
  if (input.implementationDone !== undefined) {
    values.push(input.implementationDone);
    sets.push(`implementation_done = $${values.length}`);
  }
  if (input.live !== undefined) {
    values.push(input.live);
    sets.push(`live = $${values.length}`);
  }
  if (sets.length === 0) {
    return getAcquisitionCompanyById(id);
  }
  sets.push(`updated_at = now()`);
  values.push(id);

  const { rows } = await pool.query<AcquisitionCompanyRow>(
    `UPDATE acquisition_companies SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING ${COLUMNS}`,
    values,
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function deleteAcquisitionCompany(id: number): Promise<AcquisitionCompany | undefined> {
  const { rows } = await pool.query<AcquisitionCompanyRow>(`DELETE FROM acquisition_companies WHERE id = $1 RETURNING ${COLUMNS}`, [id]);
  return rows[0] ? mapRow(rows[0]) : undefined;
}
