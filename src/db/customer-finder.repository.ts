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

export interface CustomerFinderResultFilter {
  keywords: string;
  city: string;
}

// Ohne Filter: ALLE jemals gesammelten, noch nicht akzeptierten/verworfenen
// Treffer (frueheres Verhalten). Mit Filter: nur Treffer aus Jobs mit
// exakt derselben (normalisierten) Branche+Stadt-Kombination - behebt den
// Hauptbug (Nutzerfeedback 2026-09-28): die Ergebnisliste zeigte bisher
// IMMER alle Treffer aus JEDER jemals gestarteten Suche zusammen an, auch
// von voellig anderen Branchen/Staedten (z.B. Friseur-Treffer blieben nach
// einer neuen "Fahrschule"-Suche einfach mit in der Liste stehen - siehe
// customer-finder.routes.ts/CustomerFinder.tsx fuer das Scoping im
// Frontend). job_id kann NULL sein (siehe deleteCustomerFinderResult/Schema)
// - solche verwaisten Zeilen kommen dann nur in der ungefilterten Abfrage.
export async function listCustomerFinderResults(filter?: CustomerFinderResultFilter): Promise<CustomerFinderResult[]> {
  if (!filter) {
    const { rows } = await pool.query<CustomerFinderResultRow>(
      `SELECT ${RESULT_COLUMNS} FROM customer_finder_results ORDER BY created_at DESC`,
    );
    return rows.map(mapResultRow);
  }
  const { rows } = await pool.query<CustomerFinderResultRow>(
    `SELECT r.id, r.job_id, r.name, r.phone, r.email, r.website, r.category, r.address, r.rating, r.review_count, r.opening_hours, r.created_at
     FROM customer_finder_results r
     JOIN customer_finder_jobs j ON j.id = r.job_id
     WHERE lower(trim(j.keywords)) = lower(trim($1)) AND lower(trim(j.city)) = lower(trim($2))
     ORDER BY r.created_at DESC`,
    [filter.keywords, filter.city],
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

// Normalisierter Dedupe-Schluessel fuer einen Treffer: der Scraper liefert
// keine stabile ID (place_id/cid werden bewusst nicht gespeichert, siehe
// extractLeadRows()), daher Name+Adresse klein geschrieben/getrimmt als
// bester verfuegbarer Ersatz.
function dedupeKey(name: string, address: string | null): string {
  return `${name.trim().toLowerCase()}|${(address ?? "").trim().toLowerCase()}`;
}

// Bulk-Insert der bereits gefilterten Scraper-Treffer (siehe
// customer-finder-scraper.ts: extractLeadRows()) - eine Query statt einer Query pro Zeile.
// Dedupliziert gegen bereits vorhandene (noch nicht akzeptierte/verworfene)
// Treffer: erneutes Klicken auf "Suchen" mit denselben Keywords/derselben
// Stadt lieferte sonst jedes Mal dieselben Firmen erneut als "neue"
// Ergebniszeilen (Nutzerfeedback 2026-09-28).
//
// Race-sicher per DB-Unique-Index + ON CONFLICT DO NOTHING (Migration 0078)
// statt eines vorherigen SELECT-dann-INSERT-Checks: der hatte ein TOCTOU-
// Zeitfenster - zwei nahezu gleichzeitige Suchen (z.B. zwei schnelle Klicks)
// haetten beide denselben "noch nicht vorhanden"-Zustand gesehen und den
// Treffer trotzdem doppelt eingefuegt (gefunden bei der Kundenfinder-
// Vollanalyse 2026-09-28). Intra-Batch-Dedupe zusaetzlich vorneweg, damit
// ein einzelner INSERT nicht unnoetig mit sich selbst kollidierenden Zeilen
// arbeitet (fuer DO NOTHING zwar unschaedlich, aber unnoetig).
export async function createCustomerFinderResults(jobId: number, leads: ScrapedLead[]): Promise<CustomerFinderResult[]> {
  if (leads.length === 0) return [];

  const seenKeys = new Set<string>();
  const newLeads = leads.filter((lead) => {
    const key = dedupeKey(lead.name, lead.address);
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });

  const values: unknown[] = [];
  const rowsSql = newLeads.map((lead, i) => {
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
     VALUES ${rowsSql.join(", ")}
     ON CONFLICT (lower(trim(name)), lower(trim(coalesce(address, ''))))
     DO NOTHING
     RETURNING ${RESULT_COLUMNS}`,
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
