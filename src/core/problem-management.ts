// Phase 35 "Enterprise Problem Management & Root-Cause Intelligence" - reine
// Kompositionsschicht. JEDES Signal stammt aus einer bereits bestehenden
// Engine/Repository-Funktion:
//   - Recurring-Incident-Aggregation (Problem Candidates): Phase 33
//     (db/reliability-intelligence.repository.ts#getRecurringIncidentGroups,
//     additiv um firstIncidentAt/avgMttrMs erweitert).
//   - SLO-Zustand/Error-Budget: Phase 34 (db/slo.repository.ts,
//     core/error-budget.ts) UNVERAENDERT wiederverwendet.
//   - Postmortem-Daten: Phase 26 (db/postmortems.repository.ts) UNVERAENDERT
//     wiederverwendet - keine zweite Root-Cause-Struktur.
//   - Owner-Tenant-Sicherheit: Phase 15 (db/organizations.repository.ts
//     #getOrganizationMembership/isPlatformOwner), dasselbe Fallback-Muster
//     wie middleware/authorize.ts.
// Neu (Phase 35, nur die tatsaechlich fehlenden Aggregationen):
// db/problems.repository.ts.
import {
  createProblem,
  deleteProblem,
  getAffectedProjectIdsForProblems,
  getCheckIdsWithOpenProblem,
  getCorrelatedChangesForIncidents,
  getProblemById,
  getProblemImpact,
  getProblemImpactSummaries,
  countProblemsByStatus,
  linkChange,
  linkIncident,
  listProblems,
  listProblemsForIncident,
  listRelatedChanges,
  listRelatedIncidents,
  unlinkChange,
  unlinkIncident,
  updateProblem,
  type CreateProblemInput,
  type ListProblemsFilter,
  type ProblemStatusCounts,
  type UpdateProblemInput,
} from "../db/problems.repository";
import { getOrganizationMembership, isPlatformOwner } from "../db/organizations.repository";
import { getProjectIdsForOrganization } from "../db/projects.repository";
import { getRecurringIncidentGroups } from "../db/reliability-intelligence.repository";
import type { ReliabilityScope } from "../db/reliability-intelligence.repository";
import { listSlos, getLatestSloEvaluationsForIds, countSloBreachesInWindow } from "../db/slo.repository";
import { computeErrorBudget } from "./error-budget";
import { getPostmortemsByIncidentIds, listActionItemsForPostmortems } from "../db/postmortems.repository";
import type {
  Problem,
  ProblemCandidate,
  ProblemDetail,
  ProblemImpact,
  ProblemIncidentPostmortemSummary,
  ProblemListRow,
  ProblemRootCauseHint,
  ProblemSloImpact,
  RelatedProblemSummary,
} from "../types/problem.types";

export { createProblem, deleteProblem, getProblemById, linkChange, linkIncident, unlinkChange, unlinkIncident, updateProblem };
export type { CreateProblemInput, UpdateProblemInput };

// Auftragspunkt 26 "Owner" - dasselbe Fallback-Muster wie middleware/
// authorize.ts#authorizePlatformOrOrganizationRole: echte Mitgliedschaft in
// GENAU dieser Organisation ODER globaler Platform-Owner-Bypass. Keine
// zweite RBAC-Struktur.
export async function isValidProblemOwner(organizationId: string, userId: string): Promise<boolean> {
  const membership = await getOrganizationMembership(organizationId, userId);
  if (membership !== undefined) return true;
  return isPlatformOwner(userId);
}

const CHANGE_CORRELATION_WINDOW_MINUTES = 240;

// ---------------------------------------------------------------------------
// Auftragspunkt 23 "Problem Overview" + "Problem Table"
// ---------------------------------------------------------------------------
export interface ProblemOverview {
  counts: ProblemStatusCounts;
  problems: ProblemListRow[];
}

// counts spiegeln IMMER die gesamte Organisation wider (wie Phase 33s
// Reliability Overview), unabhaengig von status/priority/ownerUserId-Filtern
// auf der Tabelle selbst - sonst wuerden die Kachel-Summen bei aktivem
// Filter irrefuehrend nur den gefilterten Ausschnitt zeigen.
export async function buildProblemOverview(organizationId: string, listFilter: Omit<ListProblemsFilter, "organizationId"> = {}): Promise<ProblemOverview> {
  const [counts, problems] = await Promise.all([countProblemsByStatus(organizationId), listProblems({ organizationId, ...listFilter })]);
  const problemIds = problems.map((p) => p.id);

  const [impactSummaries, projectIdsByProblem] = await Promise.all([
    getProblemImpactSummaries(problemIds),
    getAffectedProjectIdsForProblems(problemIds),
  ]);

  // SLO-Zustand fuer ALLE betroffenen Projekte auf einmal laden (Union ueber
  // alle Probleme) statt pro Problem - kein N+1 (Auftragspunkt 27).
  const allProjectIds = [...new Set([...projectIdsByProblem.values()].flat())];
  const slos = allProjectIds.length > 0 ? await listSlos({ projectIds: allProjectIds, enabled: true }) : [];
  const sloEvaluations = await getLatestSloEvaluationsForIds(slos.map((s) => s.id));
  const sloStatusByProject = new Map<string, ("HEALTHY" | "DEGRADED" | "CRITICAL")[]>();
  for (const slo of slos) {
    if (!slo.projectId) continue;
    const evaluation = sloEvaluations.get(slo.id);
    if (!evaluation) continue;
    const status = computeErrorBudget(slo.sliType, slo.target, evaluation.sliValue, slo.windowDays).status;
    const list = sloStatusByProject.get(slo.projectId) ?? [];
    list.push(status);
    sloStatusByProject.set(slo.projectId, list);
  }

  const rows: ProblemListRow[] = problems.map((problem) => {
    const impact = impactSummaries.get(problem.id);
    const projectIds = projectIdsByProblem.get(problem.id) ?? [];
    const sloImpactCount = projectIds.reduce((sum, projectId) => {
      const statuses = sloStatusByProject.get(projectId) ?? [];
      return sum + statuses.filter((s) => s === "DEGRADED" || s === "CRITICAL").length;
    }, 0);
    return {
      ...problem,
      incidentCount: impact?.incidentCount ?? 0,
      criticalIncidentCount: impact?.criticalIncidentCount ?? 0,
      lastIncidentAt: impact?.lastIncidentAt ?? null,
      sloImpactCount,
    };
  });

  return { counts, problems: rows };
}

// ---------------------------------------------------------------------------
// Auftragspunkt 24 "Problem Detail"
// ---------------------------------------------------------------------------
function buildRootCauseHints(relatedIncidents: Awaited<ReturnType<typeof listRelatedIncidents>>, correlatedChanges: Awaited<ReturnType<typeof getCorrelatedChangesForIncidents>>): ProblemRootCauseHint[] {
  const hints: ProblemRootCauseHint[] = [];

  // Auftragspunkt 6 "Root Cause" - "System kann moegliche Korrelationen
  // anzeigen" - deterministisch aus den TATSAECHLICH verknuepften Incidents,
  // NIE als bestaetigte Ursache formuliert.
  if (relatedIncidents.length >= 2) {
    const byCheck = new Map<string, number>();
    for (const incident of relatedIncidents) {
      byCheck.set(incident.checkId, (byCheck.get(incident.checkId) ?? 0) + 1);
    }
    const [topCheck, topCount] = [...byCheck.entries()].sort((a, b) => b[1] - a[1])[0]!;
    if (topCount >= 2) {
      hints.push({
        key: "dominant-check",
        text: `${topCount} von ${relatedIncidents.length} verknüpften Incidents stammen vom selben Check "${topCheck}" — mögliche gemeinsame Ursache, nicht bestätigt.`,
      });
    }
  }

  for (const change of correlatedChanges) {
    if (change.correlatedIncidentCount >= 2) {
      hints.push({
        key: `change-${change.changeId}`,
        text: `Change "${change.changeTitle}" (#${change.changeId}) korreliert zeitlich mit ${change.correlatedIncidentCount} verknüpften Incidents (${CHANGE_CORRELATION_WINDOW_MINUTES} Min. Fenster) — mögliche Korrelation, keine bestätigte Ursache.`,
      });
    }
  }

  return hints;
}

export async function getProblemDetail(problemId: number): Promise<ProblemDetail | undefined> {
  const problem = await getProblemById(problemId);
  if (!problem) return undefined;

  const [impactRaw, relatedIncidents, relatedChanges] = await Promise.all([
    getProblemImpact(problemId),
    listRelatedIncidents(problemId),
    listRelatedChanges(problemId),
  ]);
  const incidentIds = relatedIncidents.map((i) => i.id);

  const impact: ProblemImpact = {
    incidentCount: impactRaw.incidentCount,
    highCriticalIncidentCount: impactRaw.highCriticalIncidentCount,
    affectedProjectIds: impactRaw.affectedProjectIds,
    // Auftragspunkt 12 verlangt auch "betroffene Services" - services.
    // project_id ist optional/lose gekoppelt (Phase 23); bewusst NICHT
    // zusaetzlich aufgeloest, um keine irrefuehrende 1:1-Zuordnung
    // vorzutaeuschen, wo Projekte ohne Service-Eintrag existieren. Die
    // affectedProjectIds sind die verlaessliche, direkte Kennzahl.
    affectedServiceIds: [],
    totalIncidentDurationMs: impactRaw.totalIncidentDurationSeconds !== null ? Math.round(impactRaw.totalIncidentDurationSeconds * 1000) : null,
    avgMttrMs: impactRaw.avgMttrSeconds !== null ? Math.round(impactRaw.avgMttrSeconds * 1000) : null,
    firstIncidentAt: impactRaw.firstIncidentAt,
    lastIncidentAt: impactRaw.lastIncidentAt,
  };

  // Auftragspunkt 13 "SLO Integration" - wiederverwendet Phase 34
  // unveraendert (listSlos/getLatestSloEvaluationsForIds/computeErrorBudget).
  const slos = impactRaw.affectedProjectIds.length > 0 ? await listSlos({ projectIds: impactRaw.affectedProjectIds, enabled: true }) : [];
  const sloEvaluations = await getLatestSloEvaluationsForIds(slos.map((s) => s.id));
  const windowFrom = new Date(problem.createdAt);
  const windowTo = problem.resolvedAt ? new Date(problem.resolvedAt) : new Date();
  const breachCounts = await countSloBreachesInWindow(slos.map((s) => s.id), windowFrom, windowTo);
  const sloImpact: ProblemSloImpact[] = slos.map((slo) => {
    const evaluation = sloEvaluations.get(slo.id);
    const currentStatus = evaluation ? computeErrorBudget(slo.sliType, slo.target, evaluation.sliValue, slo.windowDays).status : "PENDING";
    return {
      sloId: slo.id,
      sloName: slo.name,
      projectId: slo.projectId,
      currentStatus,
      breachesDuringProblemWindow: breachCounts.get(slo.id) ?? 0,
    };
  });

  // Auftragspunkt 14 "Postmortem-Integration" - Phase 26 unveraendert
  // wiederverwendet, Batch statt einer Abfrage pro Incident.
  const postmortemByIncident = await getPostmortemsByIncidentIds(incidentIds);
  const actionItemsByPostmortem = await listActionItemsForPostmortems([...postmortemByIncident.values()].map((pm) => pm.id));
  const postmortems: ProblemIncidentPostmortemSummary[] = relatedIncidents.map((incident) => {
    const pm = postmortemByIncident.get(incident.id);
    if (!pm) {
      return { incidentId: incident.id, hasPostmortem: false, postmortemStatus: null, postmortemRootCause: null, openActionItems: 0, doneActionItems: 0 };
    }
    const items = actionItemsByPostmortem.get(pm.id) ?? [];
    return {
      incidentId: incident.id,
      hasPostmortem: true,
      postmortemStatus: pm.status,
      postmortemRootCause: pm.rootCause,
      openActionItems: items.filter((i) => i.status !== "DONE").length,
      doneActionItems: items.filter((i) => i.status === "DONE").length,
    };
  });

  const correlatedChanges = await getCorrelatedChangesForIncidents(incidentIds, CHANGE_CORRELATION_WINDOW_MINUTES);
  const rootCauseHints = buildRootCauseHints(relatedIncidents, correlatedChanges);

  return { ...problem, impact, sloImpact, postmortems, rootCauseHints, relatedIncidents, relatedChanges };
}

// ---------------------------------------------------------------------------
// Auftragspunkt 10/11 "Problem Candidates" - wiederverwendet Phase 33
// (getRecurringIncidentGroups) unveraendert, additiv um firstIncidentAt/
// avgMttrMs erweitert. Erzeugt NIEMALS automatisch ein echtes Problem.
// ---------------------------------------------------------------------------
export interface ProblemCandidateFilter {
  organizationId: string;
  hours: number;
  minCount?: number;
  limit?: number;
}

export async function getProblemCandidates(filter: ProblemCandidateFilter): Promise<ProblemCandidate[]> {
  const projectIds = await getProjectIdsForOrganization(filter.organizationId);
  const to = new Date();
  const from = new Date(to.getTime() - filter.hours * 60 * 60 * 1000);
  const scope: ReliabilityScope = { projectIds, from, to };

  const [groups, checkIdsWithOpenProblem] = await Promise.all([
    getRecurringIncidentGroups(scope, filter.minCount ?? 3, filter.limit ?? 20),
    getCheckIdsWithOpenProblem(filter.organizationId),
  ]);

  return groups.map((group) => ({
    checkId: group.checkId,
    checkType: group.checkType,
    projectId: group.projectId,
    projectName: group.projectName,
    incidentCount: group.incidentCount,
    criticalCount: group.criticalCount,
    firstIncidentAt: group.firstIncidentAt,
    lastIncidentAt: group.lastIncidentAt,
    avgMttrMs: group.avgMttrMs,
    hasOpenProblem: checkIdsWithOpenProblem.has(group.checkId),
  }));
}

// ---------------------------------------------------------------------------
// Auftragspunkt 15/19 "Command Center Integration" - schlankes Summary,
// keine Duplizierung der Command-Architektur (core/incident-command.ts).
// ---------------------------------------------------------------------------
export async function getRelatedProblemSummaries(incidentId: number): Promise<RelatedProblemSummary[]> {
  const problems = await listProblemsForIncident(incidentId);
  return problems.map((p) => ({ id: p.id, title: p.title, status: p.status, priority: p.priority }));
}

export type { Problem };
