// Phase 33 "Enterprise Reliability Intelligence & Incident Learning" - reine
// Aggregations-/Kompositionsschicht. JEDES Signal stammt aus einer bereits
// bestehenden Engine/Repository-Funktion:
//   - Incident-Trends/Heatmap/Severity/MTTR/MTBF/MTTD: analytics.repository.ts
//     (Phase 19), additiv um projectIds/severity erweitert.
//   - Health Score: dashboard.repository.ts#getAllProjectsHealth (Phase 4/15),
//     UNVERAENDERT wiederverwendet - keine zweite Health-Berechnung.
//   - MTTA/Recovery-Zeit/Wiederholungsrate/wiederkehrende Muster/Change-
//     Korrelation/Postmortem-Learning: db/reliability-intelligence.repository.ts
//     (neu, Phase 33) - die einzigen tatsaechlich fehlenden Aggregationen.
// Kein Aufruf von analyzeChangeRisk() (Phase 29) - Change-Korrelation ist
// reine Zeitfenster-SQL-Aggregation, keine Risikoanalyse pro historischer
// Kombination (Auftragspunkt 7).
import { getAllProjectsHealth } from "../db/dashboard.repository";
import { getProjectIdsForOrganization } from "../db/projects.repository";
import { getIncidentAnalytics, getIncidentDurationStats } from "../db/analytics.repository";
import {
  getChangeIncidentCorrelationStats,
  getIncidentDailyTrend,
  getMttaMs,
  getPostmortemLearningStats,
  getProjectReliabilityAggregates,
  getRecoveryStats,
  getRecurringIncidentGroups,
  getRepeatIncidentStats,
} from "../db/reliability-intelligence.repository";
import type { ReliabilityScope } from "../db/reliability-intelligence.repository";
// Phase 34 "Enterprise SLO, SLA & Error-Budget Intelligence" - wiederverwendet
// das bestehende Phase-22-SLO-System UNVERAENDERT (listSlos unterstuetzt
// bereits einen projectIds-IN-Filter, getLatestSloEvaluationsForIds bereits
// eine Batch-Abfrage - beides ohne N+1 nutzbar). Keine zweite SLO-Engine,
// keine neue Tabelle - siehe Abschlussbericht "Architekturentscheidung".
import { listSlos, getLatestSloEvaluationsForIds } from "../db/slo.repository";
import { computeErrorBudget } from "./error-budget";
import type { SloStatus } from "../types/slo.types";

export interface ReliabilityFilter {
  organizationId: string;
  hours: number;
  projectId?: string;
  severity?: string;
}

const CHANGE_CORRELATION_WINDOW_MINUTES = 240;
const RECURRING_MIN_COUNT = 3;
const RECURRING_LIMIT = 10;

async function resolveScope(filter: ReliabilityFilter): Promise<{ scope: ReliabilityScope; orgProjectIds: string[] }> {
  const orgProjectIds = await getProjectIdsForOrganization(filter.organizationId);
  const to = new Date();
  const from = new Date(to.getTime() - filter.hours * 60 * 60 * 1000);
  // Tenant-Isolation (Auftragspunkt 14/19): IMMER auf die Projekte dieser
  // Organisation begrenzt - ein zusaetzlicher projectId-Filter (falls
  // gesetzt) schraenkt NUR INNERHALB dieser Grenze weiter ein und kann sie
  // nie verlassen. Ein projectId-Filter, der KEIN Projekt dieser
  // Organisation ist (fremde Organisation oder nicht existent), fuehrt
  // bewusst zu einem LEEREN Scope (keine Incidents) statt entweder auf den
  // vollen Organisations-Scope zurueckzufallen (irrefuehrend) oder das
  // fremde Projekt ungeprueft zu uebernehmen (Cross-Tenant-Leck - beim
  // Schreiben selbst bemerkt: ein reines "filter.projectId ? [filter.projectId] : orgProjectIds"
  // haette einer Organisation Zugriff auf die Incident-Daten JEDES beliebigen
  // Projekts einer FREMDEN Organisation gegeben, solange die eigene
  // organizationId-Mitgliedschaft besteht).
  const projectIds = filter.projectId ? (orgProjectIds.includes(filter.projectId) ? [filter.projectId] : []) : orgProjectIds;
  const scope: ReliabilityScope = {
    projectIds,
    from,
    to,
    ...(filter.severity !== undefined ? { severity: filter.severity } : {}),
  };
  return { scope, orgProjectIds };
}

// ---------------------------------------------------------------------------
// Auftragspunkt 4 "Reliability Overview" (Executive Summary)
// ---------------------------------------------------------------------------
export async function buildReliabilityOverview(filter: ReliabilityFilter) {
  const { scope, orgProjectIds } = await resolveScope(filter);

  const [incidentAnalytics, mttaMs, recoveryStats, repeatStats, health, postmortemStats, changeCorrelation] = await Promise.all([
    getIncidentAnalytics({ projectIds: scope.projectIds, ...(scope.severity !== undefined ? { severity: scope.severity } : {}), hours: filter.hours }),
    getMttaMs(scope),
    getRecoveryStats(scope),
    getRepeatIncidentStats(scope),
    getAllProjectsHealth(filter.organizationId),
    getPostmortemLearningStats(scope),
    getChangeIncidentCorrelationStats(scope, CHANGE_CORRELATION_WINDOW_MINUTES, 5),
  ]);

  const openIncidents = health.reduce((sum, p) => sum + p.openIncidents, 0);
  const highCriticalIncidents = incidentAnalytics.severityDistribution.HIGH + incidentAnalytics.severityDistribution.CRITICAL;
  const totalIncidentsInWindow = incidentAnalytics.durationStats.count;
  const affectedProjectCount = incidentAnalytics.topAffectedProjects.length;

  return {
    windowHours: filter.hours,
    organizationId: filter.organizationId,
    projectCount: orgProjectIds.length,
    summary: {
      // "offene Incidents" ist bewusst NICHT auf das Zeitfenster begrenzt
      // (ein seit 3 Monaten offener Incident soll bei einem 24h-Filter nicht
      // verschwinden) - dieselbe Semantik wie health.openIncidents ueberall
      // sonst im System (z.B. Dashboard-Summary).
      openIncidents,
      highCriticalIncidents,
      // Wiederverwendet aus getPostmortemLearningStats() (dieselbe
      // "resolved=true AND created_at im Fenster"-Zaehlung wird dort ohnehin
      // schon fuer die Postmortem-Abdeckung gebraucht) statt einer zweiten,
      // separaten COUNT-Abfrage fuer denselben Wert.
      resolvedIncidents: postmortemStats.resolvedIncidentsInWindow,
      incidentsInWindow: totalIncidentsInWindow,
      mttaMs,
      mttrMs: incidentAnalytics.durationStats.mttrMs,
      mttdMs: incidentAnalytics.mttdMs,
      avgRecoveryMs: recoveryStats.avgRecoveryMs,
      incidentRatePerDay: filter.hours > 0 ? Number((totalIncidentsInWindow / (filter.hours / 24)).toFixed(2)) : 0,
      repeatRate: repeatStats.repeatRate,
      affectedProjectCount,
    },
    severityDistribution: incidentAnalytics.severityDistribution,
    topAffectedProjects: incidentAnalytics.topAffectedProjects,
    topCauses: incidentAnalytics.topCauses,
    changeCorrelation,
    postmortem: postmortemStats,
  };
}

// ---------------------------------------------------------------------------
// Auftragspunkt 5 "Incident Trends"
// ---------------------------------------------------------------------------
export async function buildReliabilityTrends(filter: ReliabilityFilter) {
  const { scope } = await resolveScope(filter);

  const [incidentAnalytics, dailyTrend] = await Promise.all([
    getIncidentAnalytics({ projectIds: scope.projectIds, ...(scope.severity !== undefined ? { severity: scope.severity } : {}), hours: filter.hours }),
    getIncidentDailyTrend(scope),
  ]);

  return {
    windowHours: filter.hours,
    dailyTrend,
    byWeekday: incidentAnalytics.byWeekday,
    heatmap: incidentAnalytics.heatmap,
    severityDistribution: incidentAnalytics.severityDistribution,
    topAffectedProjects: incidentAnalytics.topAffectedProjects,
    topCauses: incidentAnalytics.topCauses,
  };
}

// ---------------------------------------------------------------------------
// Auftragspunkt 10 "Reliability by Project" + Auftragspunkt 6 "Recurring
// Incident Intelligence"
// ---------------------------------------------------------------------------
export interface ProjectReliabilityRow {
  projectId: string;
  projectName: string;
  healthScore: number;
  openIncidents: number;
  incidentCount: number;
  criticalIncidentCount: number;
  mttrMs: number | null;
  repeatIncidentCount: number;
  openPostmortemActionItems: number;
  changeCorrelationCount: number;
  // Phase 34 - SLO-Zusammenfassung je Projekt, siehe getSloSummaryByProject().
  sloCount: number;
  worstSloStatus: SloStatus | null;
  avgErrorBudgetRemainingPercent: number | null;
}

interface ProjectSloSummary {
  sloCount: number;
  worstSloStatus: SloStatus | null;
  avgErrorBudgetRemainingPercent: number | null;
}

// Rang fuer "schlechtester Status" - CRITICAL schlaegt DEGRADED schlaegt
// HEALTHY, exakt dieselbe 3-Stufen-Ordnung wie core/error-budget.ts#deriveSloStatus.
const SLO_STATUS_SEVERITY: Record<SloStatus, number> = { HEALTHY: 0, DEGRADED: 1, CRITICAL: 2 };

// Phase 34 Auftragspunkt 9 "Project/Service Reliability" - EINE Batch-Abfrage
// fuer alle SLOs der betroffenen Projekte (listSlos({projectIds}), Phase 22)
// + EINE Batch-Abfrage fuer deren juengste Auswertungen
// (getLatestSloEvaluationsForIds, ebenfalls Phase 22) statt einer SLO-
// Abfrage pro Projekt in einer Schleife (kein N+1, Auftragspunkt 20/21).
// Nur ENABLED-SLOs zaehlen (deaktivierte SLOs werden vom Hintergrund-
// Evaluator nicht mehr ausgewertet, ihr letzter Snapshot waere irrefuehrend
// veraltet - dieselbe Filterung wie core/slo-evaluator.ts#evaluateSlosIfDue).
async function getSloSummaryByProject(projectIds: string[]): Promise<Map<string, ProjectSloSummary>> {
  if (projectIds.length === 0) return new Map();
  const slos = await listSlos({ projectIds, enabled: true });
  const scopedSlos = slos.filter((slo) => slo.projectId !== null);
  const evaluations = await getLatestSloEvaluationsForIds(scopedSlos.map((s) => s.id));

  const byProject = new Map<string, { count: number; worst: SloStatus | null; remainingSum: number; remainingCount: number }>();
  for (const slo of scopedSlos) {
    const projectId = slo.projectId as string;
    const entry = byProject.get(projectId) ?? { count: 0, worst: null, remainingSum: 0, remainingCount: 0 };
    entry.count += 1;
    const evaluation = evaluations.get(slo.id);
    if (evaluation) {
      const errorBudget = computeErrorBudget(slo.sliType, slo.target, evaluation.sliValue, slo.windowDays);
      if (entry.worst === null || SLO_STATUS_SEVERITY[errorBudget.status] > SLO_STATUS_SEVERITY[entry.worst]) {
        entry.worst = errorBudget.status;
      }
      entry.remainingSum += errorBudget.remainingPercentOfBudget;
      entry.remainingCount += 1;
    }
    byProject.set(projectId, entry);
  }

  const result = new Map<string, ProjectSloSummary>();
  for (const [projectId, entry] of byProject) {
    result.set(projectId, {
      sloCount: entry.count,
      worstSloStatus: entry.worst,
      avgErrorBudgetRemainingPercent: entry.remainingCount > 0 ? Number((entry.remainingSum / entry.remainingCount).toFixed(2)) : null,
    });
  }
  return result;
}

export async function buildReliabilityProjects(filter: ReliabilityFilter): Promise<ProjectReliabilityRow[]> {
  const { scope } = await resolveScope(filter);
  // scope.projectIds ist bereits die tenant-geprueft Grenze (siehe
  // resolveScope) - dieselbe Liste hier wiederverwendet statt sie ein
  // zweites Mal (und potenziell abweichend) aus filter.projectId
  // abzuleiten.
  const relevantProjectIds = scope.projectIds;

  const [health, aggregates, sloSummaries] = await Promise.all([
    getAllProjectsHealth(filter.organizationId),
    getProjectReliabilityAggregates(scope),
    getSloSummaryByProject(relevantProjectIds),
  ]);
  const healthById = new Map(health.map((p) => [p.id, p]));

  return relevantProjectIds
    .map((projectId): ProjectReliabilityRow | null => {
      const project = healthById.get(projectId);
      if (!project) return null;
      const sloSummary = sloSummaries.get(projectId);
      return {
        projectId,
        projectName: project.name,
        healthScore: project.health.score,
        openIncidents: project.openIncidents,
        incidentCount: aggregates.incidentCountByProject.get(projectId) ?? 0,
        criticalIncidentCount: aggregates.criticalCountByProject.get(projectId) ?? 0,
        mttrMs: aggregates.mttrByProject.get(projectId) ?? null,
        repeatIncidentCount: aggregates.repeatCountByProject.get(projectId) ?? 0,
        openPostmortemActionItems: aggregates.openActionItemsByProject.get(projectId) ?? 0,
        changeCorrelationCount: aggregates.changeCorrelationByProject.get(projectId) ?? 0,
        sloCount: sloSummary?.sloCount ?? 0,
        worstSloStatus: sloSummary?.worstSloStatus ?? null,
        avgErrorBudgetRemainingPercent: sloSummary?.avgErrorBudgetRemainingPercent ?? null,
      };
    })
    .filter((row): row is ProjectReliabilityRow => row !== null)
    .sort((a, b) => b.incidentCount - a.incidentCount || a.healthScore - b.healthScore);
}

export async function buildRecurringIncidents(filter: ReliabilityFilter) {
  const { scope } = await resolveScope(filter);
  return getRecurringIncidentGroups(scope, RECURRING_MIN_COUNT, RECURRING_LIMIT);
}

// ---------------------------------------------------------------------------
// Auftragspunkt 12 "Incident Learning Insights" - deterministisch, aus real
// abgefragten Daten generiert (keine KI, keine Halluzination). Jeder Insight
// referenziert seine Datenbasis direkt im Text.
// ---------------------------------------------------------------------------
export interface ReliabilityInsight {
  key: string;
  text: string;
}

export async function buildReliabilityInsights(filter: ReliabilityFilter): Promise<ReliabilityInsight[]> {
  const { scope } = await resolveScope(filter);

  const [recurring, changeCorrelation, postmortemStats, projects, mttaMs, incidentAnalytics] = await Promise.all([
    getRecurringIncidentGroups(scope, RECURRING_MIN_COUNT, 5),
    getChangeIncidentCorrelationStats(scope, CHANGE_CORRELATION_WINDOW_MINUTES, 3),
    getPostmortemLearningStats(scope),
    buildReliabilityProjects(filter),
    getMttaMs(scope),
    getIncidentAnalytics({ projectIds: scope.projectIds, ...(scope.severity !== undefined ? { severity: scope.severity } : {}), hours: filter.hours }),
  ]);

  const insights: ReliabilityInsight[] = [];

  for (const group of recurring.slice(0, 3)) {
    insights.push({
      key: `recurring-${group.checkId}`,
      text: `"${group.projectName}" (${group.checkType}) hatte ${group.incidentCount} Incidents in den letzten ${Math.round(filter.hours / 24)} Tagen, davon ${group.criticalCount} CRITICAL.`,
    });
  }

  if (changeCorrelation.incidentsWithPrecedingChange > 0) {
    insights.push({
      key: "change-correlation",
      text: `${changeCorrelation.incidentsWithPrecedingChange} von ${changeCorrelation.totalIncidentsInWindow} Incidents (${Math.round(changeCorrelation.correlationRate * 100)}%) folgten innerhalb von ${CHANGE_CORRELATION_WINDOW_MINUTES} Minuten auf einen Change.`,
    });
  }
  const topChange = changeCorrelation.topCorrelatedChanges[0];
  if (topChange && topChange.correlatedIncidentCount > 1) {
    insights.push({
      key: `change-${topChange.changeId}`,
      text: `Change "${topChange.changeTitle}" (#${topChange.changeId}) korreliert mit ${topChange.correlatedIncidentCount} Incidents in "${topChange.projectName}".`,
    });
  }

  const topActionItemProject = [...projects].sort((a, b) => b.openPostmortemActionItems - a.openPostmortemActionItems)[0];
  if (topActionItemProject && topActionItemProject.openPostmortemActionItems > 0) {
    insights.push({
      key: "open-action-items",
      text: `"${topActionItemProject.projectName}" besitzt ${topActionItemProject.openPostmortemActionItems} offene Postmortem Action Items.`,
    });
  }
  if (postmortemStats.actionItems.overdue > 0) {
    insights.push({
      key: "overdue-action-items",
      text: `${postmortemStats.actionItems.overdue} Postmortem Action Item(s) sind ueberfaellig (Faelligkeitsdatum ueberschritten, Status nicht DONE).`,
    });
  }
  if (postmortemStats.incidentsMissingPostmortem > 0) {
    insights.push({
      key: "missing-postmortems",
      text: `${postmortemStats.incidentsMissingPostmortem} von ${postmortemStats.resolvedIncidentsInWindow} abgeschlossenen Incidents haben noch kein Postmortem.`,
    });
  }

  const critical = incidentAnalytics.severityDistribution.CRITICAL;
  const high = incidentAnalytics.severityDistribution.HIGH;
  if (critical > 0 && high > 0 && mttaMs !== null && incidentAnalytics.durationStats.mttrMs !== null) {
    insights.push({
      key: "mtta",
      text: `Durchschnittliche Time-to-Acknowledge im Zeitraum: ${Math.round(mttaMs / 60000)} Minuten (${critical} CRITICAL, ${high} HIGH Incidents).`,
    });
  }

  // Beispiel aus dem Auftrag: "CRITICAL Incidents benoetigen durchschnittlich
  // X Minuten laenger zur Resolution als HIGH Incidents" - zwei zusaetzliche,
  // guenstige Skalar-Aggregationen (kein N+1: 2 Abfragen total, nicht pro
  // Incident), wiederverwendet ueber dieselbe getIncidentDurationStats()
  // (Phase 19) mit severity-Filter.
  const [criticalDuration, highDuration] = await Promise.all([
    getIncidentDurationStats({ ...(scope.projectIds !== undefined ? { projectIds: scope.projectIds } : {}), severity: "CRITICAL", from: scope.from, to: scope.to }),
    getIncidentDurationStats({ ...(scope.projectIds !== undefined ? { projectIds: scope.projectIds } : {}), severity: "HIGH", from: scope.from, to: scope.to }),
  ]);
  if (criticalDuration.mttrMs !== null && highDuration.mttrMs !== null) {
    const diffMinutes = Math.round((criticalDuration.mttrMs - highDuration.mttrMs) / 60000);
    if (diffMinutes !== 0) {
      insights.push({
        key: "critical-vs-high-mttr",
        text: `CRITICAL Incidents benoetigen im Durchschnitt ${Math.abs(diffMinutes)} Minuten ${diffMinutes > 0 ? "laenger" : "weniger"} zur Resolution als HIGH Incidents (${criticalDuration.count} CRITICAL, ${highDuration.count} HIGH ausgewertet).`,
      });
    }
  }

  const topProject = projects[0];
  if (topProject && topProject.incidentCount > 0) {
    insights.push({
      key: "top-project",
      text: `"${topProject.projectName}" hatte ${topProject.incidentCount} Incident(s) in den letzten ${Math.round(filter.hours / 24)} Tagen (Health Score ${topProject.healthScore}).`,
    });
  }

  return insights;
}
