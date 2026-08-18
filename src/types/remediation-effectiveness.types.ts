// Phase 36 "Enterprise Remediation & Change Effectiveness Intelligence" -
// reine Analyse-/Auswertungsschicht, KEINE neue Engine. Spiegelt keine
// Tabelle (es gibt keine neue Migration - alles ist Aggregation ueber
// bestehende Daten: incidents, changes, slos, slo_evaluations,
// problem_incidents, problem_changes).

export type EffectivenessStatus = "NOT_EVALUATED" | "INSUFFICIENT_DATA" | "NO_CHANGE" | "IMPROVED" | "STRONGLY_IMPROVED" | "REGRESSED" | "INCONCLUSIVE";

// Auftragspunkt 5 - "observed/correlated/improved/inconclusive" muessen
// klar unterscheidbar sein. evidenceStrength ist die zusammenfassende,
// fuer Menschen lesbare Einordnung, EffectivenessStatus der maschinenlesbare
// Wert dahinter (siehe core/remediation-effectiveness.ts fuer die exakten,
// dokumentierten Schwellenwerte).
export type EvidenceStrength = "NONE" | "WEAK" | "MODERATE" | "STRONG";

export type EvidenceMetric = "INCIDENT_RATE" | "CRITICAL_INCIDENTS" | "MTTR" | "SLO_STATUS" | "ERROR_BUDGET_BURN_RATE" | "NO_POST_CHANGE_INCIDENTS";
export type EvidenceDirection = "IMPROVED" | "REGRESSED" | "UNCHANGED";

export interface EvidenceItem {
  metric: EvidenceMetric;
  before: number | string | null;
  after: number | string | null;
  delta: number | string | null;
  direction: EvidenceDirection;
  interpretation: string;
}

export interface IncidentPeriodStats {
  count: number;
  criticalCount: number;
  highCriticalCount: number;
  incidentRatePerDay: number;
  totalDurationMs: number | null;
  avgMttrMs: number | null;
}

export interface IncidentComparison {
  before: IncidentPeriodStats;
  after: IncidentPeriodStats;
}

export interface SloPeriodSnapshot {
  avgSliValue: number | null;
  latestSliValue: number | null;
  latestStatus: "HEALTHY" | "DEGRADED" | "CRITICAL" | null;
  avgBurnRate: number | null;
  latestBurnRate: number | null;
  sampleCount: number;
}

export interface SloComparisonEntry {
  sloId: number;
  sloName: string;
  target: number;
  before: SloPeriodSnapshot;
  after: SloPeriodSnapshot;
}

export interface ChangeRiskSummary {
  score: number;
  verdict: string;
  blockerCount: number;
}

export interface ChangeEffectiveness {
  changeId: number;
  changeTitle: string;
  changeStatus: string;
  executionTimestamp: string | null;
  windowDays: number;
  beforeWindow: { from: string; to: string } | null;
  afterWindow: { from: string; to: string } | null;
  status: EffectivenessStatus;
  evidenceStrength: EvidenceStrength;
  reasons: string[];
  incidentComparison: IncidentComparison | null;
  recurringPattern: { checkIds: string[]; beforeCount: number; afterCount: number } | null;
  sloComparison: SloComparisonEntry[];
  evidence: EvidenceItem[];
  risk: ChangeRiskSummary | null;
  recommendation: string | null;
}

export interface ProblemEffectiveness {
  problemId: number;
  problemStatus: string;
  changes: ChangeEffectiveness[];
}
