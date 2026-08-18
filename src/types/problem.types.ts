// Phase 35 "Enterprise Problem Management & Root-Cause Intelligence".
// Spiegelt db/migrations/0057_problem_management.sql.

export type ProblemStatus = "OPEN" | "INVESTIGATING" | "KNOWN_ERROR" | "MITIGATED" | "RESOLVED" | "CLOSED";
export const PROBLEM_STATUSES: ProblemStatus[] = ["OPEN", "INVESTIGATING", "KNOWN_ERROR", "MITIGATED", "RESOLVED", "CLOSED"];

export type ProblemPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export const PROBLEM_PRIORITIES: ProblemPriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

export interface Problem {
  id: number;
  organizationId: string;
  title: string;
  description: string | null;
  status: ProblemStatus;
  priority: ProblemPriority;
  ownerUserId: string | null;
  rootCause: string | null;
  workaround: string | null;
  remediation: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface ProblemIncidentLink {
  id: number;
  problemId: number;
  incidentId: number;
  createdBy: string | null;
  createdAt: string;
}

export interface ProblemChangeLink {
  id: number;
  problemId: number;
  changeId: number;
  createdBy: string | null;
  createdAt: string;
}

// Auftragspunkt 12 "Problem Impact" - reine Aggregation ueber bereits
// verknuepfte Incidents (incidents/projects/services), keine neue Incident-
// Engine. sloAffectedProjectIds/sloBreachCount siehe Auftragspunkt 13 "SLO
// Integration" - bewusst als "correlated" gekennzeichnet (Zeitfenster-
// Korrelation, keine bewiesene Kausalitaet).
export interface ProblemImpact {
  incidentCount: number;
  highCriticalIncidentCount: number;
  affectedProjectIds: string[];
  affectedServiceIds: number[];
  totalIncidentDurationMs: number | null;
  avgMttrMs: number | null;
  firstIncidentAt: string | null;
  lastIncidentAt: string | null;
}

// Auftragspunkt 13 "SLO Integration" - wiederverwendet Phase 34 (listSlos/
// getLatestSloEvaluationsForIds/computeErrorBudget) unveraendert. Kein
// direkter FK von slo_evaluations zu incidents vorhanden - daher bewusst
// als ZEITLICH KORRELIERT gekennzeichnet (breachesDuringProblemWindow zaehlt
// slo_evaluations mit status IN (DEGRADED,CRITICAL), deren evaluated_at
// innerhalb [problem.createdAt, problem.resolvedAt ?? now] liegt), NIE als
// bewiesene Kausalitaet dargestellt (Auftragspunkt 6 "Root Cause").
export interface ProblemSloImpact {
  sloId: number;
  sloName: string;
  projectId: string | null;
  currentStatus: "HEALTHY" | "DEGRADED" | "CRITICAL" | "PENDING";
  breachesDuringProblemWindow: number;
}

// Auftragspunkt 14 "Postmortem-Integration" - reine Anzeige bereits
// vorhandener Phase-26-Daten (incident_postmortems), keine zweite Root-
// Cause-Struktur. postmortemRootCause ist die REFERENZ aus dem Postmortem
// (nicht automatisch in problem.rootCause uebernommen).
export interface ProblemIncidentPostmortemSummary {
  incidentId: number;
  hasPostmortem: boolean;
  postmortemStatus: "DRAFT" | "IN_REVIEW" | "PUBLISHED" | null;
  postmortemRootCause: string | null;
  openActionItems: number;
  doneActionItems: number;
}

// Auftragspunkt 6 "Root Cause" - NIEMALS eine unsichere Korrelation als
// bestaetigte Root Cause darstellen. Rein deterministisch aus bereits
// vorhandenen Daten (Phase 33 topCauses/Change-Korrelation), niemals eine
// KI-Vermutung.
export interface ProblemRootCauseHint {
  key: string;
  text: string;
}

export interface ProblemRelatedIncident {
  id: number;
  projectId: string;
  checkId: string;
  title: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  resolved: boolean;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ProblemRelatedChange {
  id: number;
  title: string;
  status: string;
  risk: string;
}

export interface ProblemDetail extends Problem {
  impact: ProblemImpact;
  sloImpact: ProblemSloImpact[];
  postmortems: ProblemIncidentPostmortemSummary[];
  rootCauseHints: ProblemRootCauseHint[];
  relatedIncidents: ProblemRelatedIncident[];
  relatedChanges: ProblemRelatedChange[];
}

// Auftragspunkt 9/11 "Problem Candidates" - erweitert die bestehende Phase-
// 33-Aggregation (getRecurringIncidentGroups) additiv, keine zweite
// Recurring-Incident-Engine. "Nicht bestaetigt" - der Auftrag verbietet
// explizit, hieraus automatisch ein echtes Problem zu erzeugen.
export interface ProblemCandidate {
  checkId: string;
  checkType: string;
  projectId: string;
  projectName: string;
  incidentCount: number;
  criticalCount: number;
  firstIncidentAt: string;
  lastIncidentAt: string;
  avgMttrMs: number | null;
  hasOpenProblem: boolean;
}

export interface ProblemListRow extends Problem {
  incidentCount: number;
  criticalIncidentCount: number;
  lastIncidentAt: string | null;
  sloImpactCount: number;
}

// Auftragspunkt 19 "Command Center Integration" - schlankes Summary fuer
// core/incident-command.ts#buildCommandOverview, keine Duplizierung der
// vollen ProblemDetail-Struktur dort.
export interface RelatedProblemSummary {
  id: number;
  title: string;
  status: ProblemStatus;
  priority: ProblemPriority;
}
