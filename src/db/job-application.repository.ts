import { pool } from "./pool";
import type { CreateJobApplicationInput, JobApplication, JobApplicationStatus, UpdateJobApplicationInput } from "../types/job-application.types";

interface JobApplicationRow {
  id: string | number;
  company: string;
  position: string | null;
  applied_at: string | Date | null;
  location: string | null;
  interview_note: string | null;
  status: JobApplicationStatus;
  notes: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function toDateOnlyString(value: string | Date | null): string | null {
  if (value === null) return null;
  const iso = value instanceof Date ? value.toISOString() : value;
  return iso.slice(0, 10);
}

// BIGSERIAL-Id kommt vom pg-Treiber als String zurueck - explizit zu Number
// gewandelt (siehe CLAUDE.md BIGSERIAL/BIGINT-Konvention).
function mapRow(row: JobApplicationRow): JobApplication {
  return {
    id: Number(row.id),
    company: row.company,
    position: row.position,
    appliedAt: toDateOnlyString(row.applied_at),
    location: row.location,
    interviewNote: row.interview_note,
    status: row.status,
    notes: row.notes,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

const COLUMNS = `id, company, position, applied_at, location, interview_note, status, notes, created_at, updated_at`;

export async function listJobApplications(): Promise<JobApplication[]> {
  const { rows } = await pool.query<JobApplicationRow>(
    `SELECT ${COLUMNS} FROM job_applications ORDER BY applied_at DESC NULLS LAST, created_at DESC`,
  );
  return rows.map(mapRow);
}

export async function createJobApplication(input: CreateJobApplicationInput): Promise<JobApplication> {
  const { rows } = await pool.query<JobApplicationRow>(
    `INSERT INTO job_applications (company, position, applied_at, location, interview_note, status, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${COLUMNS}`,
    [
      input.company,
      input.position ?? null,
      input.appliedAt ?? null,
      input.location ?? null,
      input.interviewNote ?? null,
      input.status ?? "OFFEN",
      input.notes ?? null,
    ],
  );
  return mapRow(rows[0]!);
}

export async function updateJobApplication(id: number, input: UpdateJobApplicationInput): Promise<JobApplication | undefined> {
  const { rows } = await pool.query<JobApplicationRow>(
    `UPDATE job_applications SET
       company = COALESCE($1, company),
       position = CASE WHEN $2::boolean THEN $3 ELSE position END,
       applied_at = CASE WHEN $4::boolean THEN $5::date ELSE applied_at END,
       location = CASE WHEN $6::boolean THEN $7 ELSE location END,
       interview_note = CASE WHEN $8::boolean THEN $9 ELSE interview_note END,
       status = COALESCE($10, status),
       notes = CASE WHEN $11::boolean THEN $12 ELSE notes END,
       updated_at = now()
     WHERE id = $13
     RETURNING ${COLUMNS}`,
    [
      input.company ?? null,
      "position" in input,
      input.position ?? null,
      "appliedAt" in input,
      input.appliedAt ?? null,
      "location" in input,
      input.location ?? null,
      "interviewNote" in input,
      input.interviewNote ?? null,
      input.status ?? null,
      "notes" in input,
      input.notes ?? null,
      id,
    ],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function deleteJobApplication(id: number): Promise<JobApplication | undefined> {
  const { rows } = await pool.query<JobApplicationRow>(`DELETE FROM job_applications WHERE id = $1 RETURNING ${COLUMNS}`, [id]);
  return rows[0] ? mapRow(rows[0]) : undefined;
}
