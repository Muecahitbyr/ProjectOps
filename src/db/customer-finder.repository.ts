import { pool } from "./pool";
import type {
  CreateCustomerFinderJobInput,
  CustomerFinderJob,
  CustomerFinderJobStatus,
  CustomerFinderResult,
  ScrapedLead,
} from "../types/customer-finder.types";

interface CustomerFinderJobRow {
  id: string | number;
  keywords: string;
  city: string;
  scraper_job_id: string | null;
  status: CustomerFinderJobStatus;
  filter_no_website: boolean;
  filter_max_review_count: number | null;
  result_count: number;
  error_message: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

interface CustomerFinderResultRow {
  id: string | number;
  job_id: string | number | null;
  name: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  category: string | null;
  address: string | null;
  rating: string | null;
  review_count: number | null;
  opening_hours: string | null;
  created_at: string | Date;
}

function toIsoString(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

// BIGSERIAL-Id kommt vom pg-Treiber als String zurueck - explizit zu Number
// gewandelt (siehe CLAUDE.md BIGSERIAL/BIGINT-Konvention). Gleiches gilt fuer
// NUMERIC-Spalten (rating).
function mapJobRow(row: CustomerFinderJobRow): CustomerFinderJob {
  return {
    id: Number(row.id),
    keywords: row.keywords,
    city: row.city,
    scraperJobId: row.scraper_job_id,
    status: row.status,
    filterNoWebsite: row.filter_no_website,
    filterMaxReviewCount: row.filter_max_review_count,
    resultCount: row.result_count,
    errorMessage: row.error_message,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapResultRow(row: CustomerFinderResultRow): CustomerFinderResult {
  return {
    id: Number(row.id),
    jobId: row.job_id === null ? null : Number(row.job_id),
    name: row.name,
    phone: row.phone,
    email: row.email,
    website: row.website,
    category: row.category,
    address: row.address,
    rating: row.rating === null ? null : Number(row.rating),
    reviewCount: row.review_count,
    openingHours: row.opening_hours,
    createdAt: toIsoString(row.created_at),
  };
}

const JOB_COLUMNS = `id, keywords, city, scraper_job_id, status, filter_no_website, filter_max_review_count, result_count, error_message, created_at, updated_at`;
const RESULT_COLUMNS = `id, job_id, name, phone, email, website, category, address, rating, review_count, opening_hours, created_at`;

export async function listCustomerFinderJobs(): Promise<CustomerFinderJob[]> {
  const { rows } = await pool.query<CustomerFinderJobRow>(
    `SELECT ${JOB_COLUMNS} FROM customer_finder_jobs ORDER BY created_at DESC LIMIT 20`,
  );
  return rows.map(mapJobRow);
}

export async function createCustomerFinderJob(input: CreateCustomerFinderJobInput): Promise<CustomerFinderJob> {
  const { rows } = await pool.query<CustomerFinderJobRow>(
    `INSERT INTO customer_finder_jobs (keywords, city, filter_no_website, filter_max_review_count)
     VALUES ($1, $2, $3, $4) RETURNING ${JOB_COLUMNS}`,
    [input.keywords, input.city, input.filterNoWebsite ?? false, input.filterMaxReviewCount ?? null],
  );
  return mapJobRow(rows[0]!);
}

interface UpdateCustomerFinderJobInput {
  status?: CustomerFinderJobStatus;
  resultCount?: number;
  errorMessage?: string | null;
}

export async function updateCustomerFinderJob(id: number, input: UpdateCustomerFinderJobInput): Promise<CustomerFinderJob | undefined> {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (input.status !== undefined) {
    values.push(input.status);
    sets.push(`status = $${values.length}`);
  }
  if (input.resultCount !== undefined) {
    values.push(input.resultCount);
    sets.push(`result_count = $${values.length}`);
  }
  if (input.errorMessage !== undefined) {
    values.push(input.errorMessage);
    sets.push(`error_message = $${values.length}`);
  }
  if (sets.length === 0) {
    const { rows } = await pool.query<CustomerFinderJobRow>(`SELECT ${JOB_COLUMNS} FROM customer_finder_jobs WHERE id = $1`, [id]);
    return rows[0] ? mapJobRow(rows[0]) : undefined;
  }
  sets.push(`updated_at = now()`);
  values.push(id);

  const { rows } = await pool.query<CustomerFinderJobRow>(
    `UPDATE customer_finder_jobs SET ${sets.join(", ")} WHERE id = $${values.length} RETURNING ${JOB_COLUMNS}`,
    values,
  );
  return rows[0] ? mapJobRow(rows[0]) : undefined;
}

export async function listCustomerFinderResults(): Promise<CustomerFinderResult[]> {
  const { rows } = await pool.query<CustomerFinderResultRow>(
    `SELECT ${RESULT_COLUMNS} FROM customer_finder_results ORDER BY created_at DESC`,
  );
  return rows.map(mapResultRow);
}

export async function getCustomerFinderResultById(id: number): Promise<CustomerFinderResult | undefined> {
  const { rows } = await pool.query<CustomerFinderResultRow>(
    `SELECT ${RESULT_COLUMNS} FROM customer_finder_results WHERE id = $1`,
    [id],
  );
  return rows[0] ? mapResultRow(rows[0]) : undefined;
}

// Bulk-Insert der bereits gefilterten Scraper-Treffer (siehe
// customer-finder-scraper.ts: extractLeadRows()) - eine Query statt einer Query pro Zeile.
export async function createCustomerFinderResults(jobId: number, leads: ScrapedLead[]): Promise<CustomerFinderResult[]> {
  if (leads.length === 0) return [];

  const values: unknown[] = [];
  const rowsSql = leads.map((lead, i) => {
    const base = i * 10;
    values.push(
      jobId,
      lead.name,
      lead.phone,
      lead.email,
      lead.website,
      lead.category,
      lead.address,
      lead.rating,
      lead.reviewCount,
      lead.openingHours,
    );
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10})`;
  });
  const { rows } = await pool.query<CustomerFinderResultRow>(
    `INSERT INTO customer_finder_results (job_id, name, phone, email, website, category, address, rating, review_count, opening_hours)
     VALUES ${rowsSql.join(", ")} RETURNING ${RESULT_COLUMNS}`,
    values,
  );
  return rows.map(mapResultRow);
}

export async function deleteCustomerFinderResult(id: number): Promise<CustomerFinderResult | undefined> {
  const { rows } = await pool.query<CustomerFinderResultRow>(
    `DELETE FROM customer_finder_results WHERE id = $1 RETURNING ${RESULT_COLUMNS}`,
    [id],
  );
  return rows[0] ? mapResultRow(rows[0]) : undefined;
}
