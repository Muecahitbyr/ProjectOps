import { pool } from "./pool";
import type { IncidentAnalysis } from "../ai/analysis.types";

export interface AiAnalysisRecord {
  id: number;
  incidentId: number;
  summary: string;
  rootCause: string;
  recommendation: string;
  // NULL fuer Analysen aus der Zeit vor Phase 9 (Spalten wurden additiv
  // ergaenzt, siehe Migration 0023) - kein rueckwirkendes Backfill.
  affectedSystems: string[] | null;
  recommendedSteps: string[] | null;
  confidenceScore: number | null;
  createdAt: string;
}

interface AiAnalysisRow {
  id: number;
  incident_id: number;
  summary: string;
  root_cause: string;
  recommendation: string;
  affected_systems: string[] | null;
  recommended_steps: string[] | null;
  confidence_score: string | null;
  created_at: string | Date;
}

const AI_ANALYSIS_COLUMNS = `
  id, incident_id, summary, root_cause, recommendation,
  affected_systems, recommended_steps, confidence_score, created_at
`;

function mapRow(row: AiAnalysisRow): AiAnalysisRecord {
  return {
    id: row.id,
    incidentId: row.incident_id,
    summary: row.summary,
    rootCause: row.root_cause,
    recommendation: row.recommendation,
    affectedSystems: row.affected_systems,
    recommendedSteps: row.recommended_steps,
    confidenceScore: row.confidence_score === null ? null : Number(row.confidence_score),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

export async function recordAnalysis(incidentId: number, analysis: IncidentAnalysis): Promise<AiAnalysisRecord> {
  const { rows } = await pool.query<AiAnalysisRow>(
    `INSERT INTO ai_analysis (incident_id, summary, root_cause, recommendation, affected_systems, recommended_steps, confidence_score)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${AI_ANALYSIS_COLUMNS}`,
    [
      incidentId,
      analysis.summary,
      analysis.rootCause,
      analysis.recommendation,
      JSON.stringify(analysis.affectedSystems),
      JSON.stringify(analysis.recommendedSteps),
      analysis.confidenceScore,
    ],
  );

  const row = rows[0];
  if (!row) {
    throw new Error("KI-Analyse konnte nicht gespeichert werden");
  }
  return mapRow(row);
}

export async function getAnalysisForIncident(incidentId: number): Promise<AiAnalysisRecord | undefined> {
  const { rows } = await pool.query<AiAnalysisRow>(
    `SELECT ${AI_ANALYSIS_COLUMNS} FROM ai_analysis WHERE incident_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [incidentId],
  );
  return rows[0] ? mapRow(rows[0]) : undefined;
}
