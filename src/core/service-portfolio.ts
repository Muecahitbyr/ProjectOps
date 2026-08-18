// Phase 48 "Enterprise Service Portfolio & Strategic Lifecycle Intelligence" -
// reine Korrelationsschicht ueber bereits bestehende, bereits bounded
// Org-Uebersichten. KEINE neue Registry, KEINE neue Score-Berechnung:
//   - Service-Stammdaten/Lifecycle/Criticality/Owner: db/services.repository.ts
//     #listServices() (Phase 23) - UNVERAENDERT, EINE Query fuer ALLE
//     Services der Organisation.
//   - Technischer Ist-Zustand: core/service-resilience.ts#buildResilienceOverview()
//     (Phase 37/41, bereits 15s gecacht) - EINE Abfrage fuer ALLE Projekte.
//   - Business Impact: core/business-impact-overview.ts#buildBusinessImpactOverview()
//     (Phase 47) - bereits auf Top-N beschraenkt, hier UNVERAENDERT
//     uebernommen (nicht pro Service erneut aufgerufen).
//   - Wiederkehrende Outcome-Fehlschlaege: core/outcome-intelligence.ts
//     #getOutcomeIntelligenceSummary() (Phase 45) - EINE Org-weite Abfrage.
//   - Kapazitaets-/Forecast-Risiko: core/capacity-intelligence.ts
//     #buildCapacityWatchlist() (Phase 46) - bereits auf Top-N beschraenkt.
// Auftragspunkt 12 "keine ineffiziente Mehrfachberechnung" - GENAU 5
// Org-weite Aufrufe, UNABHAENGIG von der Anzahl Services (kein Aufruf einer
// dieser Funktionen INNERHALB einer Schleife ueber Services).
import { listServices } from "../db/services.repository";
import { buildResilienceOverview } from "./service-resilience";
import { buildBusinessImpactOverview } from "./business-impact-overview";
import { getOutcomeIntelligenceSummary } from "./outcome-intelligence";
import { buildCapacityWatchlist } from "./capacity-intelligence";
import type { ResilienceOverviewRow, ResilienceStatus } from "../types/resilience.types";
import type { PortfolioClassification, PortfolioReason, ServicePortfolioEntry, ServicePortfolioSummary } from "../types/service-portfolio.types";

// ---------------------------------------------------------------------------
// SCHWELLENWERT-DOKUMENTATION (dieselbe etablierte Groessenordnung wie an
// jeder anderen Stelle dieser Codebase, keine neu erfundene Zahl):
//   RECURRING_INCIDENT_THRESHOLD: identisch zu RECURRING_MIN_COUNT
//     (core/reliability-intelligence.ts, Phase 33) / RECURRING_INCIDENT_THRESHOLD
//     (core/service-resilience.ts, Phase 37) / RECURRING_PATTERN_MIN_COUNT
//     (core/outcome-intelligence.ts, Phase 45) - drei gleichartige Ereignisse
//     gelten in diesem System bereits durchgaengig als "kein Zufall mehr".
// ---------------------------------------------------------------------------
const RECURRING_INCIDENT_THRESHOLD = 3;

// Bounded Top-N fuer die Anreicherungs-Uebersichten (Business Impact/
// Capacity) - derselbe Default/Max wie Phase 43/46/47, damit ein grosses
// Portfolio nicht versehentlich eine unbegrenzte teure Berechnung ausloest.
const ENRICHMENT_LIMIT = 50;

function classify(
  row: ResilienceOverviewRow | undefined,
  lifecycleStatus: string,
  businessImpactTier: ServicePortfolioEntry["businessImpactTier"],
  hasCapacitySignal: ServicePortfolioEntry["hasCapacitySignal"],
  isRecurringOutcomePattern: ServicePortfolioEntry["isRecurringOutcomePattern"],
): { classification: PortfolioClassification; reasons: PortfolioReason[] } {
  const reasons: PortfolioReason[] = [];

  if (!row || row.resilienceStatus === "UNKNOWN") {
    return { classification: "INSUFFICIENT_DATA", reasons: [{ kind: "NO_MONITORING_DATA", detail: "No linked project with monitoring data - a strategic assessment is not possible yet." }] };
  }

  if (lifecycleStatus === "DEPRECATED" && (row.dependentCount > 0 || row.isPotentialSpof)) {
    reasons.push({
      kind: "DEPRECATED_WITH_DEPENDENTS",
      detail: `Marked DEPRECATED but still has ${row.dependentCount} dependent service(s)${row.isPotentialSpof ? " and looks like a single point of failure" : ""} - retiring it without a migration plan would be risky.`,
    });
    return { classification: "RETIREMENT_RISK", reasons };
  }

  const chronicallyCritical = row.resilienceStatus === "CRITICAL" && row.recurringIncidentCount >= RECURRING_INCIDENT_THRESHOLD;
  const severeBusinessImpact = businessImpactTier === "SEVERE" || businessImpactTier === "HIGH";
  if (lifecycleStatus === "ACTIVE" && (chronicallyCritical || (severeBusinessImpact && isRecurringOutcomePattern === true))) {
    if (chronicallyCritical) {
      reasons.push({ kind: "RECURRING_INCIDENTS", detail: `Currently CRITICAL with ${row.recurringIncidentCount} recurring incidents - a structural, not a transient, problem.` });
    }
    if (severeBusinessImpact && isRecurringOutcomePattern === true) {
      reasons.push({ kind: "BUSINESS_IMPACT", detail: `Business impact tier ${businessImpactTier} combined with a recurring pattern of unresolved acknowledgments.` });
    }
    return { classification: "STRATEGIC_REVIEW_RECOMMENDED", reasons };
  }

  if (row.resilienceStatus === "CRITICAL" || row.resilienceStatus === "AT_RISK") {
    reasons.push({ kind: "CURRENT_STATUS", detail: `Current resilience status is ${row.resilienceStatus}.` });
    if (hasCapacitySignal === true) reasons.push({ kind: "CAPACITY_TREND", detail: "A degrading capacity/forecast trend is also present." });
    if (businessImpactTier !== "NOT_EVALUATED" && businessImpactTier !== "NONE" && businessImpactTier !== "UNKNOWN") {
      reasons.push({ kind: "BUSINESS_IMPACT", detail: `Business impact tier is ${businessImpactTier}.` });
    }
    return { classification: "AT_RISK", reasons };
  }

  if (hasCapacitySignal === true) {
    reasons.push({ kind: "CAPACITY_TREND", detail: "A degrading capacity/forecast trend was detected even though the current status is not yet critical." });
    return { classification: "AT_RISK", reasons };
  }

  if (row.resilienceStatus === "DEGRADED" || row.openCriticalProblems > 0 || row.errorBudgetRisk) {
    if (row.resilienceStatus === "DEGRADED") reasons.push({ kind: "CURRENT_STATUS", detail: "Current resilience status is DEGRADED." });
    if (row.openCriticalProblems > 0) reasons.push({ kind: "OPEN_CRITICAL_PROBLEMS", detail: `${row.openCriticalProblems} open critical problem(s).` });
    if (row.errorBudgetRisk) reasons.push({ kind: "ERROR_BUDGET_RISK", detail: "Error budget is at risk on at least one SLO." });
    return { classification: "NEEDS_ATTENTION", reasons };
  }

  return { classification: "STABLE", reasons: [] };
}

export interface ServicePortfolioFilter {
  organizationId: string;
  hours: number;
}

export async function buildServicePortfolio(filter: ServicePortfolioFilter): Promise<ServicePortfolioSummary> {
  const [services, overview, businessImpact, outcomeSummary, capacityWatchlist] = await Promise.all([
    listServices({ organizationId: filter.organizationId }),
    buildResilienceOverview({ organizationId: filter.organizationId, hours: filter.hours }),
    buildBusinessImpactOverview({ organizationId: filter.organizationId, hours: filter.hours, limit: ENRICHMENT_LIMIT }),
    getOutcomeIntelligenceSummary(filter.organizationId, filter.hours),
    buildCapacityWatchlist({ organizationId: filter.organizationId, hours: filter.hours, limit: ENRICHMENT_LIMIT }),
  ]);

  const overviewByProjectId = new Map(overview.rows.map((row) => [row.projectId, row]));
  const businessImpactByProjectId = new Map(businessImpact.entries.map((e) => [e.projectId, e.businessImpact.tier]));
  const recurringOutcomeByProjectId = new Map(outcomeSummary.projects.map((p) => [p.projectId, p.isRecurringPattern]));
  const capacitySignalProjectIds = new Set(capacityWatchlist.entries.map((e) => e.projectId));

  const counts: Record<PortfolioClassification, number> = { STABLE: 0, NEEDS_ATTENTION: 0, AT_RISK: 0, STRATEGIC_REVIEW_RECOMMENDED: 0, RETIREMENT_RISK: 0, INSUFFICIENT_DATA: 0 };
  const entries: ServicePortfolioEntry[] = services.map((service) => {
    const row = service.projectId ? overviewByProjectId.get(service.projectId) : undefined;
    const businessImpactTier = service.projectId && businessImpactByProjectId.has(service.projectId) ? businessImpactByProjectId.get(service.projectId)! : "NOT_EVALUATED";
    const isRecurringOutcomePattern = service.projectId && recurringOutcomeByProjectId.has(service.projectId) ? recurringOutcomeByProjectId.get(service.projectId)! : "NOT_EVALUATED";
    const hasCapacitySignal = service.projectId ? (capacitySignalProjectIds.has(service.projectId) ? true : ("NOT_EVALUATED" as const)) : ("NOT_EVALUATED" as const);

    const { classification, reasons } = classify(row, service.lifecycleStatus, businessImpactTier, hasCapacitySignal, isRecurringOutcomePattern);
    counts[classification] += 1;

    const resilienceStatus: ResilienceStatus | null = row?.resilienceStatus ?? null;

    return {
      serviceId: service.id,
      serviceName: service.name,
      projectId: service.projectId,
      projectName: row?.projectName ?? null,
      criticality: service.criticality,
      lifecycleStatus: service.lifecycleStatus,
      environment: service.environment,
      businessOwner: service.businessOwner,
      resilienceStatus,
      dependentCount: row?.dependentCount ?? 0,
      isPotentialSpof: row?.isPotentialSpof ?? false,
      businessImpactTier,
      hasCapacitySignal,
      isRecurringOutcomePattern,
      classification,
      reasons,
    };
  });

  // Strategisch dringlichste zuerst - dieselbe Prioritaetsreihenfolge wie
  // die Klassifikationsleiter oben (Auftragspunkt "keine kuenstliche
  // Praezision", eine einfache, nachvollziehbare Sortierung statt eines
  // zweiten Scores).
  const CLASSIFICATION_SORT_RANK: Record<PortfolioClassification, number> = {
    STRATEGIC_REVIEW_RECOMMENDED: 5,
    RETIREMENT_RISK: 4,
    AT_RISK: 3,
    NEEDS_ATTENTION: 2,
    INSUFFICIENT_DATA: 1,
    STABLE: 0,
  };
  entries.sort((a, b) => CLASSIFICATION_SORT_RANK[b.classification] - CLASSIFICATION_SORT_RANK[a.classification] || a.serviceName.localeCompare(b.serviceName));

  return {
    organizationId: filter.organizationId,
    windowHours: filter.hours,
    generatedAt: new Date().toISOString(),
    totalServices: services.length,
    counts,
    entries,
  };
}
