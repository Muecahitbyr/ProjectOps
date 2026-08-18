// Phase 37 "Enterprise Service Resilience & Dependency Intelligence" -
// Bestandsanalyse-Ergebnis: core/topology.ts (Phase 25, Blast Radius/SPOF/
// Dependency-Graph/Related Signals), core/service-health.ts (Phase 23,
// Health), core/reliability-intelligence.ts (Phase 33/34, Incidents/MTTR/
// SLO-Zusammenfassung je Projekt), core/problem-management.ts (Phase 35),
// core/remediation-effectiveness.ts (Phase 36) und core/change-risk.ts
// (Phase 29) decken JEDES einzelne benoetigte Signal bereits ab. Es gibt
// KEINE bestehende Stelle, die diese Signale projekt-/serviceuebergreifend
// zu einer Resilience-Uebersicht bzw. einem deterministischen
// Resilience-Status zusammenfuehrt - das ist die alleinige, additive
// Aufgabe dieser Phase. Keine neue Migration (reine Kompositions-/
// Aggregationsschicht ueber bestehenden Tabellen).

import type { SloStatus } from "./slo.types";
import type { ServiceCriticality, DependencyCriticality, DependencyType } from "./service.types";
import type { ServiceBusinessImpact } from "./business-impact.types";

// Phase 41 "Resilience Layer Performance & Consistency Hardening" - vorher
// identisch dupliziert in routes/resilience.routes.ts UND
// routes/v1/resilience.routes.ts (echte, live gefundene Code-Duplikation).
// Zentralisiert hier, analog zu SLO_HISTORY_WINDOW_HOURS in types/slo.types.ts
// (Phase 22), das routes/v1/slo.routes.ts bereits genauso wiederverwendet.
export const RESILIENCE_RANGE_VALUES = ["24h", "7d", "30d", "90d"] as const;
export type ResilienceRangeValue = (typeof RESILIENCE_RANGE_VALUES)[number];
export const RESILIENCE_RANGE_HOURS: Record<ResilienceRangeValue, number> = {
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
  "90d": 24 * 90,
};

// "UNKNOWN" bewusst als eigene, ehrliche Stufe (analog zu ServiceHealthStatus,
// service.types.ts) - ein Projekt ohne zugeordneten Service/ohne Messdaten
// bekommt NIE einen erfundenen "HEALTHY"-Status.
export type ResilienceStatus = "HEALTHY" | "DEGRADED" | "AT_RISK" | "CRITICAL" | "UNKNOWN";
export const RESILIENCE_STATUSES: ResilienceStatus[] = ["HEALTHY", "DEGRADED", "AT_RISK", "CRITICAL", "UNKNOWN"];

export type ResilienceSignalType =
  | "POTENTIAL_SINGLE_POINT_OF_FAILURE"
  | "CRITICAL_DEPENDENCY_UNHEALTHY"
  | "HIGH_INCIDENT_RATE"
  | "RECURRING_INCIDENT_PATTERN"
  | "OPEN_CRITICAL_PROBLEM"
  | "SLO_AT_RISK"
  | "ERROR_BUDGET_LOW"
  | "HIGH_CHANGE_RISK"
  | "REGRESSED_REMEDIATION"
  | "LARGE_BLAST_RADIUS"
  // Phase 42 "Enterprise Resilience Forecast Intelligence" - verbindet die
  // bereits bestehende, bislang von der Resilience-Kette isolierte
  // statistische Forecast-Engine (db/forecast.repository.ts, Phase 13:
  // lineare Regression, keine KI) mit dem Resilience-Detailblick. Beide
  // Signale sind rein PROSPEKTIV (Trend), beeinflussen bewusst NICHT
  // resilienceStatus selbst (das bleibt strikt der Ist-Zustand) - siehe
  // core/service-resilience.ts fuer die genauen Schwellenwerte.
  | "PROJECTED_DEGRADATION"
  | "PROJECTED_INCIDENT_INCREASE"
  // Phase 46 "Enterprise Capacity Early-Warning & Trend Intelligence" -
  // db/forecast.repository.ts#getResponseTimeForecast() existiert bereits
  // seit Phase 13, war bislang aber NIE in die Resilience-Kette eingebunden
  // (nur ueber die generische /api/forecasts/:metric-Route fuer
  // Analytics-Charts erreichbar). Dieselbe rein-prospektive Behandlung wie
  // die beiden Signale oben - siehe core/service-resilience.ts fuer den
  // (relativen, nicht absoluten) Schwellenwert.
  | "PROJECTED_RESPONSE_TIME_DEGRADATION";

export type ResilienceSignalSeverity = "INFO" | "WARNING" | "CRITICAL";

export interface ResilienceSignal {
  type: ResilienceSignalType;
  severity: ResilienceSignalSeverity;
  title: string;
  explanation: string;
  affectedEntity: { kind: "SERVICE" | "PROJECT" | "SLO" | "PROBLEM" | "CHANGE"; id: string | number; name: string };
}

// Auftragspunkt "Resilience Overview" - EINE Zeile je Projekt der
// Organisation (nicht je Service - ein Projekt ohne verknuepften Service
// erscheint mit resilienceStatus=UNKNOWN und leeren Dependency-Feldern statt
// zu fehlen, siehe core/service-resilience.ts).
export interface ResilienceOverviewRow {
  projectId: string;
  projectName: string;
  serviceId: number | null;
  serviceName: string | null;
  serviceCriticality: ServiceCriticality | null;
  healthScore: number;
  healthStatus: "HEALTHY" | "DEGRADED" | "CRITICAL" | "UNKNOWN";
  incidentCount: number;
  highCriticalCount: number;
  openIncidentCount: number;
  mttrMs: number | null;
  recurringIncidentCount: number;
  openProblems: number;
  openCriticalProblems: number;
  sloCount: number;
  criticalSLOCount: number;
  worstSloStatus: SloStatus | null;
  errorBudgetRisk: boolean;
  dependencyCount: number;
  dependentCount: number;
  blastRadius: number;
  isPotentialSpof: boolean;
  resilienceStatus: ResilienceStatus;
}

export interface ResilienceOverview {
  windowHours: number;
  organizationId: string;
  projectCount: number;
  summary: {
    critical: number;
    atRisk: number;
    degraded: number;
    healthy: number;
    unknown: number;
    potentialSpofCount: number;
  };
  rows: ResilienceOverviewRow[];
}

export interface ResilienceDependencyEntry {
  serviceId: number;
  serviceName: string;
  projectId: string | null;
  dependencyType: DependencyType;
  criticality: DependencyCriticality;
  healthStatus: "HEALTHY" | "DEGRADED" | "CRITICAL" | "UNKNOWN";
  openIncidents: number;
  worstSloStatus: SloStatus | null;
}

export interface ServiceDependencyIntelligence {
  serviceId: number;
  serviceName: string;
  dependencies: ResilienceDependencyEntry[];
  dependents: ResilienceDependencyEntry[];
}

// Phase 57 "Enterprise Operational Dependency & Blast Radius Assurance" -
// core/topology.ts#getFullImpactAnalysis() (Phase 25) liefert den vollen,
// mehrstufigen Blast Radius bereits, aber REIN STRUKTURELL (nur Service-
// Stammdaten + Tiefe, siehe FullImpactAnalysis.affectedServices). Dieser Typ
// ergaenzt AUSSCHLIESSLICH die dafuer fehlende Health-/SLO-Anreicherung
// (core/service-resilience.ts#enrichAffectedServicesWithStatus()) - dieselben
// Felder wie ResilienceDependencyEntry (keine zweite Definition), plus depth.
export interface EnrichedImpactedService {
  serviceId: number;
  serviceName: string;
  projectId: string | null;
  depth: number | null;
  healthStatus: "HEALTHY" | "DEGRADED" | "CRITICAL" | "UNKNOWN";
  openIncidents: number;
  worstSloStatus: SloStatus | null;
}

export interface ServiceChangeRiskSummary {
  changeId: number;
  title: string;
  status: string;
  score: number;
  verdict: "SAFE" | "WARNING" | "BLOCKED";
}

// Phase 42 "Enterprise Resilience Forecast Intelligence" - Spiegelt
// ForecastResult (types/forecast.types.ts) auf die zwei tatsaechlich
// wiederverwendeten Metriken, angereichert um einen deterministisch
// abgeleiteten "trend"-Text (kein zusaetzliches statistisches Modell -
// nur eine Vorzeichen-/Schwellenwert-Klassifikation von slopePerDay, siehe
// core/service-resilience.ts#classifyForecastTrend()).
export type ResilienceForecastTrend = "IMPROVING" | "STABLE" | "DEGRADING" | "UNKNOWN";

export interface ResilienceForecastSummary {
  sufficientData: boolean;
  slopePerDay: number | null;
  rSquared: number | null;
  currentValue: number | null;
  projectedValue: number | null;
  forecastDays: number;
  trend: ResilienceForecastTrend;
}

export interface ServiceResilienceForecast {
  healthScore: ResilienceForecastSummary;
  incidentCount: ResilienceForecastSummary;
  // Phase 46 "Enterprise Capacity Early-Warning & Trend Intelligence".
  responseTimeMs: ResilienceForecastSummary;
}

export interface ServiceResilienceDetail {
  projectId: string;
  projectName: string;
  serviceId: number | null;
  serviceName: string | null;
  serviceCriticality: ServiceCriticality | null;
  resilienceStatus: ResilienceStatus;
  health: {
    status: "HEALTHY" | "DEGRADED" | "CRITICAL" | "UNKNOWN";
    reasons: string[];
    openIncidents: number;
  };
  reliability: {
    incidentCount: number;
    highCriticalCount: number;
    mttrMs: number | null;
    recurringIncidentCount: number;
  };
  slo: {
    sloCount: number;
    worstSloStatus: SloStatus | null;
    avgErrorBudgetRemainingPercent: number | null;
  };
  problems: {
    openCount: number;
    openCriticalCount: number;
    items: { id: number; title: string; status: string; priority: string }[];
  };
  dependencies: ServiceDependencyIntelligence | null;
  blastRadius: {
    affectedServiceCount: number;
    maxDepthReached: number;
    truncated: boolean;
    hasCriticalPath: boolean;
    spofCount: number;
  } | null;
  isPotentialSpof: boolean;
  activeChangeRisks: ServiceChangeRiskSummary[];
  remediationEffectiveness: { problemId: number; changeId: number; changeTitle: string; status: string }[];
  forecast: ServiceResilienceForecast;
  signals: ResilienceSignal[];
  // Phase 47 "Enterprise Business Impact & Service Criticality Intelligence".
  businessImpact: ServiceBusinessImpact;
}

// Phase 43 "Enterprise Operational Priority Intelligence" - siehe
// core/operational-priority.ts fuer die vollstaendige Bestandsanalyse/
// Architekturentscheidung. Reine Orchestrierungs-/Rangfolge-Schicht ueber
// ResilienceOverview/ServiceResilienceDetail (37/41/42) - keine neuen
// Rohsignale, nur Priorisierung + deterministisch abgeleitete Erklaerung.
export type PriorityQueueConfidence = "HIGH" | "MEDIUM";

export interface PriorityQueueReason {
  signalType: ResilienceSignalType;
  severity: ResilienceSignalSeverity;
  title: string;
  explanation: string;
}

// Phase 44 "Enterprise Priority Queue Acknowledgment Governance" - live aus
// audit_log abgeleitet (core/operational-priority.ts), NICHT separat
// gespeichert. snapshotResilienceStatus/snapshotPriorityScore/
// snapshotReason halten fest, WORAUFHIN die Bestaetigung erfolgte
// ("Ausgangszustand", Auftragspunkt 8 "Auditierbarkeit").
export interface PriorityQueueAcknowledgment {
  acknowledgedBy: string;
  acknowledgedAt: string;
  note: string | null;
  snapshotResilienceStatus: ResilienceStatus;
  snapshotPriorityScore: number;
  snapshotReason: string | null;
}

export interface PriorityQueueEntry {
  projectId: string;
  projectName: string;
  serviceId: number | null;
  serviceName: string | null;
  resilienceStatus: ResilienceStatus;
  priorityScore: number;
  primaryReason: PriorityQueueReason | null;
  recommendedAction: string;
  confidence: PriorityQueueConfidence;
  signalCount: number;
  acknowledgment: PriorityQueueAcknowledgment | null;
}

export interface PriorityQueue {
  organizationId: string;
  windowHours: number;
  generatedAt: string;
  entries: PriorityQueueEntry[];
}
