// Phase 64 "Enterprise Operational Priority & Attention Management" -
// Bestandsanalyse: Priority Queue (Phase 43, core/operational-priority.ts)
// rankt bereits Projekte/Services org-weit; Decision Context (Phase 50-62,
// core/decision-context.ts) liefert bereits Begruendungen/Empfehlungen,
// aber bewusst NUR je-Service-skaliert (siehe dessen Dateikopf); Incidents
// (assigneeId), Problems (ownerUserId) und Changes (ownerId) tragen bereits
// je einen echten Owner - aber KEINE dieser drei Listen wird standardmaessig
// nach Schweregrad sortiert (immer nur ORDER BY created_at DESC), und keine
// Funktion fasst einzelne Incidents/Problems/Changes/Governance-Konflikte
// als EIGENE Zeilen zusammen mit den bereits vorhandenen Service-Risiko-
// Zeilen der Priority Queue.
//
// Dieses Modul fuegt GENAU DAS additiv hinzu: es ruft ausschliesslich
// bereits bestehende Funktionen auf (buildPriorityQueue, getIncidents,
// listProblems, listChanges, detectAutomationRuleConflicts) und mappt jedes
// Ergebnis auf einen gemeinsamen AttentionItem-Typ, dessen "tier" NIE neu
// berechnet wird, sondern IMMER direkt aus dem bereits vorhandenen Feld der
// Quelle stammt (Incident.severity / Problem.priority / Change.risk sind
// bereits wortgleich CRITICAL|HIGH|MEDIUM|LOW; SERVICE_RISK wird ueber das
// bereits etablierte RESILIENCE_RANK abgeleitet). KEINE neue Risk-/
// Priority-/Recommendation-Engine, keine KI-/Freitext-Bewertung.
import { buildPriorityQueue, RECOMMENDED_ACTION_BY_SIGNAL } from "./operational-priority";
import { buildResilienceOverview } from "./service-resilience";
import { detectAutomationRuleConflicts } from "./governance-rule-conflicts";
import { getIncidents } from "../db/incidents.repository";
import { listProblems, listRelatedIncidents, getAffectedProjectIdsForProblems } from "../db/problems.repository";
import { listChanges } from "../db/changes.repository";
import { getProjectIdsForOrganization } from "../db/projects.repository";
import type { AttentionItem, AttentionItemKind, AttentionList, AttentionTier } from "../types/attention.types";
import type { ProblemStatus } from "../types/problem.types";
import type { ResilienceStatus } from "../types/resilience.types";

export interface AttentionListFilter {
  organizationId: string;
  hours: number;
  limit?: number;
  // Nutzt das bereits bestehende Owner-Feld der jeweiligen Quelle
  // (Incident.assigneeId / Problem.ownerUserId / Change.ownerId) - schliesst
  // die in der Bestandsanalyse festgestellte Luecke "keine
  // domaenenuebergreifende 'meine zugewiesenen Elemente'-Sicht", ohne ein
  // neues Owner-/Assignment-Konzept einzufuehren.
  ownerId?: string;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// Bounded-Top-N-Kandidatenmengen (dasselbe Muster wie ueberall sonst in
// diesem System, z.B. Phase 63s COMPETING_CHANGES_CANDIDATE_LIMIT) - billig
// vorselektieren, dann nach Tier sortieren und auf die tatsaechliche
// Ausgabegroesse kuerzen.
const INCIDENT_CANDIDATE_LIMIT = 100;
const PROBLEM_CANDIDATE_LIMIT = 100;
const CHANGE_CANDIDATE_LIMIT = 50;

// Reine Sortier-Ordinalzahl eines bereits ueberall etablierten 4-Werte-
// Vokabulars (Incident.severity/Problem.priority/Change.risk nutzen exakt
// dieselben vier Werte) - keine neue Bewertung.
const TIER_RANK: Record<AttentionTier, number> = { CRITICAL: 3, HIGH: 2, MEDIUM: 1, LOW: 0 };

// SERVICE_RISK erscheint hier nur mit CRITICAL/AT_RISK/DEGRADED (HEALTHY/
// UNKNOWN werden von buildPriorityQueue() bereits ausgeschlossen, siehe
// dortiger Kommentar) - direkte Ableitung aus dem bereits etablierten
// RESILIENCE_RANK, keine neue Skala.
const SERVICE_RISK_TIER: Partial<Record<ResilienceStatus, AttentionTier>> = {
  CRITICAL: "CRITICAL",
  AT_RISK: "HIGH",
  DEGRADED: "MEDIUM",
};

// Gleichstand-Aufloesung INNERHALB desselben Tiers: bewusst KEINE neue,
// domaenenuebergreifende numerische Fusion (das waere die verbotene "neue
// Priority Engine") - stattdessen entscheidet zuerst eine dokumentierte,
// feste Reihenfolge der Art (ein Service-Risiko mit Breitenwirkung vor
// einem einzelnen Incident derselben Stufe, davor ein Problem mit
// laufender Root-Cause-Analyse, davor ein Governance-Konflikt, zuletzt eine
// anstehende Aenderung), danach die JEWEILS EIGENE, bereits etablierte
// Ordnung der Quelle selbst (SERVICE_RISK: priorityScore; alle anderen:
// Alter - laenger unbearbeitet zuerst).
const KIND_RANK: Record<AttentionItemKind, number> = {
  SERVICE_RISK: 0,
  INCIDENT: 1,
  PROBLEM: 2,
  GOVERNANCE_CONFLICT: 3,
  CHANGE: 4,
};

const PROBLEM_OPEN_STATUSES: ProblemStatus[] = ["OPEN", "INVESTIGATING", "KNOWN_ERROR", "MITIGATED"];

const PROBLEM_RECOMMENDED_ACTION_BY_STATUS: Record<string, string> = {
  OPEN: "Begin root-cause investigation.",
  INVESTIGATING: "Continue the ongoing root-cause investigation.",
  KNOWN_ERROR: "Apply the documented workaround or plan a permanent fix.",
  MITIGATED: "Confirm the mitigation is holding and plan permanent remediation.",
};

const GOVERNANCE_CONFLICT_TIER: Record<string, AttentionTier> = {
  CONTRADICTORY_ACTIONS: "HIGH",
  REDUNDANT_DUPLICATE: "MEDIUM",
};

const GOVERNANCE_CONFLICT_RECOMMENDED_ACTION: Record<string, string> = {
  CONTRADICTORY_ACTIONS: "Review these automation rules - they trigger different actions for the same event and may conflict at runtime.",
  REDUNDANT_DUPLICATE: "Consider consolidating these automation rules - they perform the identical action for the same trigger.",
};

function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / (60 * 60 * 1000);
}

async function buildServiceRiskItems(organizationId: string, hours: number): Promise<AttentionItem[]> {
  const queue = await buildPriorityQueue({ organizationId, hours, limit: MAX_LIMIT });
  return queue.entries.map((entry) => ({
    kind: "SERVICE_RISK",
    entityId: null,
    projectId: entry.projectId,
    projectName: entry.projectName,
    title: entry.serviceName ?? entry.projectName,
    tier: SERVICE_RISK_TIER[entry.resilienceStatus] ?? "MEDIUM",
    reason: entry.primaryReason?.explanation ?? entry.primaryReason?.title ?? `Resilience status ${entry.resilienceStatus}.`,
    recommendedAction: entry.recommendedAction,
    ownerId: null,
    createdAt: null,
    priorityScore: entry.priorityScore,
  }));
}

async function buildIncidentAndProblemItems(
  organizationId: string,
  projectIds: string[],
  nameById: Map<string, string>,
): Promise<{ items: AttentionItem[]; suppressedDuplicateIncidentCount: number }> {
  const problemCandidates = (await listProblems({ organizationId, limit: PROBLEM_CANDIDATE_LIMIT })).filter((p) =>
    PROBLEM_OPEN_STATUSES.includes(p.status),
  );

  const [affectedProjectsByProblem, relatedIncidentsByProblem] = await Promise.all([
    getAffectedProjectIdsForProblems(problemCandidates.map((p) => p.id)),
    Promise.all(problemCandidates.map(async (p) => ({ problemId: p.id, incidents: await listRelatedIncidents(p.id) }))),
  ]);

  // Rauschunterdrueckung ueber die BEREITS BESTEHENDE Phase-35-Verknuepfung
  // (problem_incidents) - ein Incident, der bereits einem zurueckgegebenen
  // Problem zugeordnet ist, erscheint NICHT zusaetzlich als eigener
  // INCIDENT-Eintrag (das Problem repraesentiert ihn bereits konsolidiert).
  // Keine neue Aehnlichkeits-/Dedup-Erkennung - reine Nutzung der
  // vorhandenen Fremdschluessel-Relation.
  const linkedIncidentIds = new Set<number>();
  for (const { incidents } of relatedIncidentsByProblem) {
    for (const incident of incidents) linkedIncidentIds.add(incident.id);
  }

  const problemItems: AttentionItem[] = problemCandidates.map((problem) => {
    const affectedProjects = affectedProjectsByProblem.get(problem.id) ?? [];
    const primaryProjectId = affectedProjects[0] ?? null;
    const multiProject = affectedProjects.length > 1;
    return {
      kind: "PROBLEM",
      entityId: problem.id,
      projectId: primaryProjectId,
      projectName: primaryProjectId ? (nameById.get(primaryProjectId) ?? primaryProjectId) : null,
      title: problem.title,
      tier: problem.priority,
      reason: multiProject ? `${problem.title} (affects ${affectedProjects.length} projects)` : problem.title,
      recommendedAction: PROBLEM_RECOMMENDED_ACTION_BY_STATUS[problem.status] ?? "Review this problem's status.",
      ownerId: problem.ownerUserId,
      createdAt: problem.createdAt,
      priorityScore: null,
    };
  });

  const incidentCandidates = await getIncidents({ resolved: false, projectIds, limit: INCIDENT_CANDIDATE_LIMIT });
  const dedupedIncidents = incidentCandidates.filter((i) => !linkedIncidentIds.has(i.id));
  const suppressedDuplicateIncidentCount = incidentCandidates.length - dedupedIncidents.length;

  const incidentItems: AttentionItem[] = dedupedIncidents.map((incident) => ({
    kind: "INCIDENT",
    entityId: incident.id,
    projectId: incident.projectId,
    projectName: nameById.get(incident.projectId) ?? incident.projectId,
    title: incident.title,
    tier: incident.severity,
    reason: `${incident.title} (open ${hoursSince(incident.createdAt).toFixed(1)}h, ${incident.acknowledgedAt ? "acknowledged" : "unacknowledged"})`,
    recommendedAction: incident.acknowledgedAt
      ? "Continue investigating - already acknowledged but still open."
      : "Acknowledge and investigate this open incident.",
    ownerId: incident.assigneeId,
    createdAt: incident.createdAt,
    priorityScore: null,
  }));

  return { items: [...incidentItems, ...problemItems], suppressedDuplicateIncidentCount };
}

async function buildChangeItems(organizationId: string): Promise<AttentionItem[]> {
  const [scheduled, inProgress] = await Promise.all([
    listChanges({ organizationId, status: "SCHEDULED", limit: CHANGE_CANDIDATE_LIMIT }),
    listChanges({ organizationId, status: "IN_PROGRESS", limit: CHANGE_CANDIDATE_LIMIT }),
  ]);
  return [...scheduled, ...inProgress].map((change) => ({
    kind: "CHANGE",
    entityId: change.id,
    // Change ist Service-Katalog-, nicht Projekt-skaliert (siehe
    // src/types/change.types.ts) - ohne verknuepften Katalog-Service ist
    // kein Projekt ableitbar; bewusst NICHT erzwungen.
    projectId: null,
    projectName: null,
    title: change.title,
    tier: change.risk,
    reason: change.title,
    recommendedAction: RECOMMENDED_ACTION_BY_SIGNAL.HIGH_CHANGE_RISK,
    ownerId: change.ownerId,
    createdAt: change.createdAt,
    priorityScore: null,
  }));
}

async function buildGovernanceConflictItems(projectIds: string[], nameById: Map<string, string>): Promise<AttentionItem[]> {
  const conflictsByProject = await Promise.all(projectIds.map(async (projectId) => ({ projectId, conflicts: await detectAutomationRuleConflicts(projectId) })));
  const items: AttentionItem[] = [];
  for (const { projectId, conflicts } of conflictsByProject) {
    for (const conflict of conflicts) {
      const leadRule = conflict.rules[0];
      items.push({
        kind: "GOVERNANCE_CONFLICT",
        entityId: leadRule?.ruleId ?? null,
        projectId,
        projectName: nameById.get(projectId) ?? projectId,
        title: `${conflict.kind === "CONTRADICTORY_ACTIONS" ? "Contradictory" : "Redundant"} automation rules on ${conflict.trigger}`,
        tier: GOVERNANCE_CONFLICT_TIER[conflict.kind] ?? "MEDIUM",
        reason: `${conflict.rules.length} rules (${conflict.rules.map((r) => r.name).join(", ")}) react to ${conflict.trigger}.`,
        recommendedAction: GOVERNANCE_CONFLICT_RECOMMENDED_ACTION[conflict.kind] ?? "Review these automation rules.",
        ownerId: null,
        createdAt: null,
        priorityScore: null,
      });
    }
  }
  return items;
}

function sortItems(items: AttentionItem[]): AttentionItem[] {
  return [...items].sort((a, b) => {
    const tierDiff = TIER_RANK[b.tier] - TIER_RANK[a.tier];
    if (tierDiff !== 0) return tierDiff;
    const kindDiff = KIND_RANK[a.kind] - KIND_RANK[b.kind];
    if (kindDiff !== 0) return kindDiff;
    if (a.kind === "SERVICE_RISK") return (b.priorityScore ?? 0) - (a.priorityScore ?? 0);
    const ageA = a.createdAt ? new Date(a.createdAt).getTime() : Date.now();
    const ageB = b.createdAt ? new Date(b.createdAt).getTime() : Date.now();
    return ageA - ageB; // aeltest zuerst
  });
}

export async function buildAttentionList(filter: AttentionListFilter): Promise<AttentionList> {
  const limit = Math.min(Math.max(filter.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  const [projectIds, overview] = await Promise.all([
    getProjectIdsForOrganization(filter.organizationId),
    // Bereits gecacht (Phase 41) - liefert projectName fuer ALLE Projekte
    // der Organisation (nicht nur nicht-gesunde), wird hier ausschliesslich
    // als Namens-Lookup wiederverwendet, keine zweite Abfrage.
    buildResilienceOverview({ organizationId: filter.organizationId, hours: filter.hours }),
  ]);
  const nameById = new Map(overview.rows.map((r) => [r.projectId, r.projectName]));

  const [serviceRiskItems, incidentAndProblem, changeItems, governanceItems] = await Promise.all([
    buildServiceRiskItems(filter.organizationId, filter.hours),
    buildIncidentAndProblemItems(filter.organizationId, projectIds, nameById),
    buildChangeItems(filter.organizationId),
    buildGovernanceConflictItems(projectIds, nameById),
  ]);

  let allItems = [...serviceRiskItems, ...incidentAndProblem.items, ...changeItems, ...governanceItems];
  if (filter.ownerId !== undefined) {
    allItems = allItems.filter((item) => item.ownerId === filter.ownerId);
  }

  return {
    organizationId: filter.organizationId,
    windowHours: filter.hours,
    generatedAt: new Date().toISOString(),
    items: sortItems(allItems).slice(0, limit),
    suppressedDuplicateIncidentCount: incidentAndProblem.suppressedDuplicateIncidentCount,
  };
}
