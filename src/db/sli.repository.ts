import { pool } from "./pool";
import { SUCCESSFUL_CHECK_STATUSES } from "../config/health.config";
import { API_ERROR_STATUS_CODE_THRESHOLD } from "../config/slo.config";

// Phase 22 Auftragspunkt 3 "SLI System" - berechnet Service Level Indicators
// AUSSCHLIESSLICH aus den bereits bestehenden Rohdaten (check_results,
// api_key_usage) - keine neue Datenquelle, keine zweite Analytics-Engine.
// availabilityPercent (db/analytics.repository.ts, getAvailabilityPercent)
// ist die bereits bestehende, identische Berechnung fuer Projekte; hier um
// einen optionalen check_id-Scope (Auftragspunkt 4 "optional Check/API
// Service") und die uebrigen SLI-Typen (Latency/API) ergaenzt, bewusst in
// einer eigenen Datei statt die grosse analytics.repository.ts weiter
// aufzublaehen - dieselben Tabellen/Konventionen (SUCCESSFUL_CHECK_STATUSES),
// keine abweichende Definition von "erfolgreich".
//
// Phase 28 "Enterprise Maintenance Windows, Change Management & Deployment
// Risk" Auftragspunkt "geplante Wartungen nicht unnoetig als SLA-/SLO-
// Probleme werten" - echter, live bestaetigter Bug behoben (siehe
// Abschlussbericht "Gefundene echte Bugs"): die drei check-basierten SLIs
// unten zaehlten Messwerte waehrend eines aktiven Wartungsfensters bisher
// GENAUSO gegen das Error-Budget wie jeden anderen Ausfall - obwohl
// core/monitor.ts fuer denselben Zeitraum bereits bewusst KEINEN Incident
// eroeffnet. Der NOT EXISTS-Ausschluss unten nutzt exakt dieselbe, bereits
// bestehende maintenance_windows-Tabelle (keine neue Datenquelle) und
// erfasst automatisch auch von Changes erzeugte Fenster (core/change-
// lifecycle.ts, Phase 28), ohne dass diese Datei etwas von Changes wissen
// muss. API-SLIs (getApiAvailabilitySli/getApiErrorRateSli) sind bewusst
// NICHT betroffen - API-Traffic ist projektunabhaengig, ein
// projektbezogenes Wartungsfenster hat keinen fachlichen Bezug dazu.
const EXCLUDE_MAINTENANCE_CLAUSE = `NOT EXISTS (
  SELECT 1 FROM maintenance_windows mw
  WHERE mw.project_id = c.project_id AND cr.checked_at >= mw.starts_at AND cr.checked_at < mw.ends_at
)`;

export interface SliResult {
  value: number;
  sampleCount: number;
}

function noSamples(): SliResult {
  return { value: 100, sampleCount: 0 };
}

export async function getAvailabilitySli(projectId: string, checkId: string | null, from: Date, to: Date): Promise<SliResult> {
  const conditions = ["c.project_id = $1", "cr.checked_at >= $2", "cr.checked_at < $3", EXCLUDE_MAINTENANCE_CLAUSE];
  const values: unknown[] = [projectId, from.toISOString(), to.toISOString()];
  if (checkId) {
    values.push(checkId);
    conditions.push(`c.id = $${values.length}`);
  }
  values.push(SUCCESSFUL_CHECK_STATUSES);
  const successParam = `$${values.length}`;

  const { rows } = await pool.query<{ total: string; success: string }>(
    `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE cr.status = ANY(${successParam}::text[])) AS success
     FROM check_results cr JOIN checks c ON c.id = cr.check_id
     WHERE ${conditions.join(" AND ")}`,
    values,
  );
  const total = Number(rows[0]?.total ?? 0);
  const success = Number(rows[0]?.success ?? 0);
  if (total === 0) return noSamples();
  return { value: Number(((success / total) * 100).toFixed(4)), sampleCount: total };
}

// Eigenstaendig berechnet (nicht einfach "100 - availability"), damit ein
// abweichender Fehlerbegriff (nur ERROR/OFFLINE, WARNING zaehlt hier NICHT
// als Fehler) unabhaengig von der Verfuegbarkeits-Definition (die WARNING
// als "erfolgreich" wertet, siehe SUCCESSFUL_CHECK_STATUSES) explizit bleibt.
export async function getErrorRateSli(projectId: string, checkId: string | null, from: Date, to: Date): Promise<SliResult> {
  const conditions = ["c.project_id = $1", "cr.checked_at >= $2", "cr.checked_at < $3", EXCLUDE_MAINTENANCE_CLAUSE];
  const values: unknown[] = [projectId, from.toISOString(), to.toISOString()];
  if (checkId) {
    values.push(checkId);
    conditions.push(`c.id = $${values.length}`);
  }

  const { rows } = await pool.query<{ total: string; errors: string }>(
    `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE cr.status IN ('ERROR', 'OFFLINE')) AS errors
     FROM check_results cr JOIN checks c ON c.id = cr.check_id
     WHERE ${conditions.join(" AND ")}`,
    values,
  );
  const total = Number(rows[0]?.total ?? 0);
  const errors = Number(rows[0]?.errors ?? 0);
  if (total === 0) return { value: 0, sampleCount: 0 };
  return { value: Number(((errors / total) * 100).toFixed(4)), sampleCount: total };
}

// Anteil der Checks MIT gemessener Antwortzeit, die innerhalb des
// Latenzziels liegen (z.B. "99% unter 500ms"). Checks ohne response_time_ms
// (z.B. ein reiner DNS-/SSL-Check) werden nicht mitgezaehlt - eine fehlende
// Messung ist weder "erfolgreich" noch "verfehlt".
export async function getLatencySli(
  projectId: string,
  checkId: string | null,
  thresholdMs: number,
  from: Date,
  to: Date,
): Promise<SliResult> {
  const conditions = ["c.project_id = $1", "cr.checked_at >= $2", "cr.checked_at < $3", "cr.response_time_ms IS NOT NULL", EXCLUDE_MAINTENANCE_CLAUSE];
  const values: unknown[] = [projectId, from.toISOString(), to.toISOString()];
  if (checkId) {
    values.push(checkId);
    conditions.push(`c.id = $${values.length}`);
  }
  values.push(thresholdMs);
  const thresholdParam = `$${values.length}`;

  const { rows } = await pool.query<{ total: string; within: string }>(
    `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE cr.response_time_ms <= ${thresholdParam}) AS within
     FROM check_results cr JOIN checks c ON c.id = cr.check_id
     WHERE ${conditions.join(" AND ")}`,
    values,
  );
  const total = Number(rows[0]?.total ?? 0);
  const within = Number(rows[0]?.within ?? 0);
  if (total === 0) return noSamples();
  return { value: Number(((within / total) * 100).toFixed(4)), sampleCount: total };
}

// API-SLIs aus der bestehenden api_key_usage-Tabelle (Phase 16/19) - dieselbe
// Fehlerdefinition (status_code >= 400) wie core/api-usage-intelligence.ts.
export async function getApiAvailabilitySli(organizationId: string, from: Date, to: Date): Promise<SliResult> {
  const { rows } = await pool.query<{ total: string; success: string }>(
    `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status_code < $4) AS success
     FROM api_key_usage WHERE organization_id = $1 AND created_at >= $2 AND created_at < $3`,
    [organizationId, from.toISOString(), to.toISOString(), API_ERROR_STATUS_CODE_THRESHOLD],
  );
  const total = Number(rows[0]?.total ?? 0);
  const success = Number(rows[0]?.success ?? 0);
  if (total === 0) return noSamples();
  return { value: Number(((success / total) * 100).toFixed(4)), sampleCount: total };
}

export async function getApiErrorRateSli(organizationId: string, from: Date, to: Date): Promise<SliResult> {
  const { rows } = await pool.query<{ total: string; errors: string }>(
    `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE status_code >= $4) AS errors
     FROM api_key_usage WHERE organization_id = $1 AND created_at >= $2 AND created_at < $3`,
    [organizationId, from.toISOString(), to.toISOString(), API_ERROR_STATUS_CODE_THRESHOLD],
  );
  const total = Number(rows[0]?.total ?? 0);
  const errors = Number(rows[0]?.errors ?? 0);
  if (total === 0) return { value: 0, sampleCount: 0 };
  return { value: Number(((errors / total) * 100).toFixed(4)), sampleCount: total };
}
