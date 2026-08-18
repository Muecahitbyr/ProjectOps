// Phase 63 "Enterprise Operational Portfolio Intelligence" - Bestandsanalyse:
// die Plattform besitzt bereits 7+ unabhaengige, org-weite Uebersichten,
// jede fuer sich bereits bounded/gecacht und ausfuehrlich getestet:
//   - Priority Queue (Phase 43) - aktuell kritische/at-risk Services.
//   - Capacity Watchlist (Phase 46/54) - gesunde, aber trendend-degradierte
//     Services.
//   - Service Portfolio (Phase 48) - Lifecycle-/Strategie-Klassifikation.
//   - Risk Correlation (Phase 58) - Signale mit geteilter Ursache ueber
//     mehrere Projekte.
//   - Control Effectiveness (Phase 60) - Change-Safety-Kontrollen.
//   - Governance Rule Conflicts (Phase 61) - widerspruechliche/ueberfluessige
//     Automation-Regeln.
//   - Outcome/Decision Quality (Phase 45/62) - Entscheidungsqualitaet.
// KEINE dieser Funktionen wird hier veraendert oder verdoppelt - dieses
// Modul ruft sie ALLE unveraendert parallel auf und fuegt AUSSCHLIESSLICH
// zwei neue, kleine Cross-Referenz-Berechnungen ueber bereits geladene
// Daten hinzu (kumulatives Risiko, konkurrierende Changes) - KEIN neues
// Engine, keine neue Rohsignalquelle.
import { buildPriorityQueue } from "./operational-priority";
import { buildCapacityWatchlist } from "./capacity-intelligence";
import { buildServicePortfolio } from "./service-portfolio";
import { buildRiskCorrelation } from "./risk-correlation";
import { getChangeControlEffectiveness } from "./control-effectiveness";
import { detectAutomationRuleConflicts } from "./governance-rule-conflicts";
import { getOutcomeIntelligenceSummary } from "./outcome-intelligence";
import { getProjectIdsForOrganization } from "../db/projects.repository";
import { listChanges, listServiceIdsForChanges } from "../db/changes.repository";
import { getServicesByIds } from "../db/services.repository";
import { getFullImpactAnalysis } from "./topology";
import type { PortfolioClassification } from "../types/service-portfolio.types";
import type { DecisionQuality } from "../types/outcome-intelligence.types";
import type { CompetingChangePair, CumulativeRiskEntry, CumulativeRiskSource, OperationalStateOverview } from "../types/operational-state.types";

export interface OperationalStateFilter {
  organizationId: string;
  hours: number;
}

// Bounded (Auftragspunkt "keine unnoetigen Abfragen") - dieselbe Vorsicht
// wie jede andere Top-N-Uebersicht in diesem System.
const COMPETING_CHANGES_CANDIDATE_LIMIT = 50;

// "Wo entstehen kumulative Risiken?" - reine Gruppierung bereits geladener
// Ergebnisse aus 4 unabhaengigen, bereits bestehenden Quellen nach
// projectId - KEINE neue Risikoberechnung.
function detectCumulativeRisk(
  priorityQueueProjectIds: Set<string>,
  capacityWatchlistProjectIds: Set<string>,
  riskCorrelationProjectIds: Set<string>,
  recurringSafetyBlockProjectIds: Set<string>,
  nameById: Map<string, string>,
): CumulativeRiskEntry[] {
  const sourcesByProject = new Map<string, Set<CumulativeRiskSource>>();
  const addSource = (projectId: string, source: CumulativeRiskSource) => {
    const set = sourcesByProject.get(projectId) ?? new Set<CumulativeRiskSource>();
    set.add(source);
    sourcesByProject.set(projectId, set);
  };
  for (const id of priorityQueueProjectIds) addSource(id, "PRIORITY_QUEUE");
  for (const id of capacityWatchlistProjectIds) addSource(id, "CAPACITY_WATCHLIST");
  for (const id of riskCorrelationProjectIds) addSource(id, "RISK_CORRELATION");
  for (const id of recurringSafetyBlockProjectIds) addSource(id, "RECURRING_SAFETY_BLOCK");

  return [...sourcesByProject.entries()]
    .filter(([, sources]) => sources.size >= 2)
    .map(([projectId, sources]) => ({
      projectId,
      projectName: nameById.get(projectId) ?? projectId,
      riskSourceCount: sources.size,
      riskSources: [...sources].sort(),
    }))
    .sort((a, b) => b.riskSourceCount - a.riskSourceCount || a.projectId.localeCompare(b.projectId));
}

// "Welche Decisions konkurrieren um dieselben Ressourcen?" - zwei aktuell
// SCHEDULED/IN_PROGRESS Changes (org-weit, nicht nur dasselbe Projekt),
// deren Blast Radius (Phase 25/57, bereits 15s gecacht) sich in mindestens
// einem Service ueberschneidet. Ergaenzt den bestehenden, projekt-internen
// Wartungsfenster-Konflikt (Phase 29) um den projektuebergreifenden Fall.
async function detectCompetingChanges(organizationId: string): Promise<CompetingChangePair[]> {
  const [scheduled, inProgress] = await Promise.all([
    listChanges({ organizationId, status: "SCHEDULED", limit: COMPETING_CHANGES_CANDIDATE_LIMIT }),
    listChanges({ organizationId, status: "IN_PROGRESS", limit: COMPETING_CHANGES_CANDIDATE_LIMIT }),
  ]);
  const activeChanges = [...scheduled, ...inProgress];
  if (activeChanges.length < 2) return [];

  const serviceIdsByChange = await listServiceIdsForChanges(activeChanges.map((c) => c.id));
  const allServiceIds = [...new Set([...serviceIdsByChange.values()].flat())];
  const services = await getServicesByIds(allServiceIds);
  const serviceById = new Map(services.map((s) => [s.id, s]));

  const footprintByChange = new Map<number, Set<number>>();
  for (const change of activeChanges) {
    const directServiceIds = serviceIdsByChange.get(change.id) ?? [];
    const footprint = new Set<number>(directServiceIds);
    for (const serviceId of directServiceIds) {
      const service = serviceById.get(serviceId);
      if (!service) continue;
      const impact = await getFullImpactAnalysis(service);
      for (const affected of impact.affectedServices) footprint.add(affected.id);
    }
    footprintByChange.set(change.id, footprint);
  }

  const pairs: CompetingChangePair[] = [];
  for (let i = 0; i < activeChanges.length; i++) {
    for (let j = i + 1; j < activeChanges.length; j++) {
      const changeA = activeChanges[i]!;
      const changeB = activeChanges[j]!;
      const footprintA = footprintByChange.get(changeA.id) ?? new Set<number>();
      const footprintB = footprintByChange.get(changeB.id) ?? new Set<number>();
      const sharedServiceIds = [...footprintA].filter((id) => footprintB.has(id));
      if (sharedServiceIds.length === 0) continue;
      pairs.push({
        changeAId: changeA.id,
        changeATitle: changeA.title,
        changeBId: changeB.id,
        changeBTitle: changeB.title,
        sharedServiceIds,
        sharedServiceNames: sharedServiceIds.map((id) => serviceById.get(id)?.name ?? String(id)),
      });
    }
  }
  return pairs;
}

export async function buildOperationalStateOverview(filter: OperationalStateFilter): Promise<OperationalStateOverview> {
  const projectIds = await getProjectIdsForOrganization(filter.organizationId);

  const [priorityQueue, capacityWatchlist, portfolio, riskCorrelation, controlEffectiveness, outcomeSummary, competingChanges, conflictsByProject] = await Promise.all([
    buildPriorityQueue({ organizationId: filter.organizationId, hours: filter.hours }),
    buildCapacityWatchlist({ organizationId: filter.organizationId, hours: filter.hours }),
    buildServicePortfolio({ organizationId: filter.organizationId, hours: filter.hours }),
    buildRiskCorrelation({ organizationId: filter.organizationId, hours: filter.hours }),
    getChangeControlEffectiveness({ organizationId: filter.organizationId, hours: filter.hours }),
    getOutcomeIntelligenceSummary(filter.organizationId, filter.hours),
    detectCompetingChanges(filter.organizationId),
    Promise.all(projectIds.map((projectId) => detectAutomationRuleConflicts(projectId))),
  ]);

  const criticalServiceCount = priorityQueue.entries.filter((e) => e.resilienceStatus === "CRITICAL").length;
  const atRiskServiceCount = priorityQueue.entries.filter((e) => e.resilienceStatus === "AT_RISK").length;
  const automationGovernanceConflictProjectCount = conflictsByProject.filter((c) => c.length > 0).length;

  const nameById = new Map<string, string>();
  for (const e of priorityQueue.entries) nameById.set(e.projectId, e.projectName);
  for (const e of capacityWatchlist.entries) nameById.set(e.projectId, e.projectName);
  for (const p of outcomeSummary.projects) nameById.set(p.projectId, p.projectName);

  const riskCorrelationProjectIds = new Set<string>();
  for (const group of riskCorrelation.groups) {
    for (const p of group.affectedProjects) {
      riskCorrelationProjectIds.add(p.projectId);
      nameById.set(p.projectId, p.projectName);
    }
  }

  const cumulativeRiskServices = detectCumulativeRisk(
    new Set(priorityQueue.entries.map((e) => e.projectId)),
    new Set(capacityWatchlist.entries.map((e) => e.projectId)),
    riskCorrelationProjectIds,
    new Set(controlEffectiveness.recurringSafetyBlockProjects.map((p) => p.projectId)),
    nameById,
  );

  const portfolioCounts: Record<PortfolioClassification, number> = portfolio.counts;
  const decisionQualityCounts: Record<DecisionQuality, number> = outcomeSummary.decisionQualityCounts;

  return {
    organizationId: filter.organizationId,
    windowHours: filter.hours,
    generatedAt: new Date().toISOString(),
    criticalServiceCount,
    atRiskServiceCount,
    capacityWatchlistCount: capacityWatchlist.entries.length,
    riskCorrelationGroups: riskCorrelation.groups,
    automationGovernanceConflictProjectCount,
    portfolioCounts,
    decisionQualityCounts,
    avgDecisionLatencyMs: outcomeSummary.avgDecisionLatencyMs,
    changeSafetyBlockTriggeredCount: controlEffectiveness.safetyBlock.triggeredCount,
    changeApprovedThenFailedCount: controlEffectiveness.approvalGate.approvedThenFailedCount,
    cumulativeRiskServices,
    competingChanges,
  };
}
