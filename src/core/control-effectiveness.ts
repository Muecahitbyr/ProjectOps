// Phase 60 "Enterprise Operational Policy & Control Effectiveness" -
// Bestandsanalyse-Ergebnis: die Change-Safety-Kette (Phase 28/29) besitzt
// bereits ZWEI echte, durchgesetzte (nicht nur beratende) Controls:
//   1. "Safety Block" - ein BLOCKED-Risikoverdikt verhindert den Start eines
//      Change (routes/changes.routes.ts, Auftragspunkt "Pre-Deployment
//      Safety Check", Phase 29), auditiert als CHANGE_START_BLOCKED.
//      EMERGENCY-Changes duerfen dies umgehen (isSafetyBlockOverridable()).
//   2. "Approval Gate" - HIGH/CRITICAL-Risiko-Changes (nicht-EMERGENCY)
//      brauchen eine APPROVED-Freigabe vor dem Start
//      (isApprovalRequiredToStart(), Phase 28).
// Beide Controls erzeugen bereits vollstaendige Evidence (audit_log +
// changes.status/approval_status) - aber NICHTS wertet je aus, OB diese
// Controls tatsaechlich wirksam sind: haben Changes, die den Safety Block
// ausgeloest haben, sich spaeter tatsaechlich als problematisch erwiesen
// (FAILED) oder liefen sie beim naechsten Versuch normal durch (COMPLETED -
// der Block war dann eher Reibung als Schutz)? Fuehrt eine formal erteilte
// Freigabe (APPROVED) trotzdem zu gescheiterten Changes (das Control war
// "formal erfuellt, operativ unwirksam")? Wiederholt sich der Safety Block
// bei DEMSELBEN Projekt (systemisches statt einmaliges Problem)?
//
// Reine Kompositions-/Auswertungsschicht - KEIN neues Engine: JEDES
// Datum stammt unveraendert aus bereits bestehenden Quellen (audit_log,
// changes-Tabelle, change_services, services). Keine neue Persistenz.
import { listAuditLog } from "../db/audit-log.repository";
import { listChanges, getChangeById, listServiceIdsForChanges } from "../db/changes.repository";
import { getServicesByIds } from "../db/services.repository";
import { getAllProjectsHealth } from "../db/dashboard.repository";
import { isApprovalRequiredToStart } from "../config/change-management.config";

// Dieselbe "3 gleichartige Ereignisse = kein Zufall"-Groessenordnung wie
// core/outcome-intelligence.ts#RECURRING_PATTERN_MIN_COUNT (Phase 45) /
// core/decision-context.ts#RECURRING_OUTCOME_FAILURE_THRESHOLD (Phase 50).
export const RECURRING_SAFETY_BLOCK_MIN_COUNT = 3;
// Bounded Kandidaten (Auftragspunkt "keine unnoetigen Abfragen"), dieselbe
// Vorsicht wie jede andere listAuditLog()-Nutzung in diesem System (Phase
// 53/55/58).
const AUDIT_SWEEP_LIMIT = 500;
const RECENT_CHANGES_LIMIT = 200;

export interface RecurringSafetyBlockProject {
  projectId: string;
  projectName: string;
  triggerCount: number;
}

export interface ChangeControlEffectivenessSummary {
  organizationId: string;
  windowHours: number;
  generatedAt: string;
  safetyBlock: {
    triggeredCount: number;
    laterCompletedCount: number;
    laterFailedCount: number;
    laterCancelledCount: number;
    stillPendingCount: number;
  };
  approvalGate: {
    approvalRequiredCount: number;
    approvedThenCompletedCount: number;
    approvedThenFailedCount: number;
  };
  recurringSafetyBlockProjects: RecurringSafetyBlockProject[];
}

interface BlockedChangeProjectIndex {
  blockedChangeIds: number[];
  projectCounts: Map<string, RecurringSafetyBlockProject>;
  changeIdsByProject: Map<string, Set<number>>;
}

async function indexBlockedChangesByProject(organizationId: string, hours: number): Promise<BlockedChangeProjectIndex> {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const auditEntries = await listAuditLog({ category: "CHANGE", from: since, limit: AUDIT_SWEEP_LIMIT });
  const blockedEvents = auditEntries.filter((e) => e.action === "CHANGE_START_BLOCKED" && e.metadata?.organizationId === organizationId);

  const blockedChangeIds = [
    ...new Set(
      blockedEvents
        .map((e) => (e.metadata?.changeId !== undefined ? Number(e.metadata.changeId) : null))
        .filter((id): id is number => id !== null && !Number.isNaN(id)),
    ),
  ];

  const [serviceIdsByChange, projectsHealth] = await Promise.all([listServiceIdsForChanges(blockedChangeIds), getAllProjectsHealth(organizationId)]);
  const projectNameById = new Map(projectsHealth.map((p) => [p.id, p.name]));
  const allServiceIds = [...new Set([...serviceIdsByChange.values()].flat())];
  const services = await getServicesByIds(allServiceIds);
  const serviceById = new Map(services.map((s) => [s.id, s]));

  const projectCounts = new Map<string, RecurringSafetyBlockProject>();
  const changeIdsByProject = new Map<string, Set<number>>();
  for (const changeId of blockedChangeIds) {
    const serviceIds = serviceIdsByChange.get(changeId) ?? [];
    const projectIds = new Set<string>();
    for (const serviceId of serviceIds) {
      const projectId = serviceById.get(serviceId)?.projectId;
      if (projectId) projectIds.add(projectId);
    }
    for (const projectId of projectIds) {
      const entry = projectCounts.get(projectId) ?? { projectId, projectName: projectNameById.get(projectId) ?? projectId, triggerCount: 0 };
      entry.triggerCount += 1;
      projectCounts.set(projectId, entry);
      const set = changeIdsByProject.get(projectId) ?? new Set<number>();
      set.add(changeId);
      changeIdsByProject.set(projectId, set);
    }
  }

  return { blockedChangeIds, projectCounts, changeIdsByProject };
}

export async function getChangeControlEffectiveness(filter: { organizationId: string; hours: number }): Promise<ChangeControlEffectivenessSummary> {
  const { blockedChangeIds, projectCounts } = await indexBlockedChangesByProject(filter.organizationId, filter.hours);

  const blockedChanges = await Promise.all(blockedChangeIds.map((id) => getChangeById(id)));
  let laterCompletedCount = 0;
  let laterFailedCount = 0;
  let laterCancelledCount = 0;
  let stillPendingCount = 0;
  for (const change of blockedChanges) {
    if (!change) continue;
    if (change.status === "COMPLETED") laterCompletedCount += 1;
    else if (change.status === "FAILED") laterFailedCount += 1;
    else if (change.status === "CANCELLED") laterCancelledCount += 1;
    else stillPendingCount += 1;
  }

  // Approval Gate: "formal erfuellt, operativ trotzdem ineffektiv" - von
  // allen Changes, die eine Freigabe brauchten UND erhielten, wie viele
  // sind TROTZDEM gescheitert? Bounded auf die juengsten Changes der
  // Organisation (dasselbe Muster wie jede andere Top-N-Uebersicht).
  const recentChanges = await listChanges({ organizationId: filter.organizationId, limit: RECENT_CHANGES_LIMIT });
  const approvalRequiredChanges = recentChanges.filter((c) => isApprovalRequiredToStart(c.changeType, c.risk));
  const approvedChanges = approvalRequiredChanges.filter((c) => c.approvalStatus === "APPROVED");
  const approvedThenCompletedCount = approvedChanges.filter((c) => c.status === "COMPLETED").length;
  const approvedThenFailedCount = approvedChanges.filter((c) => c.status === "FAILED").length;

  const recurringSafetyBlockProjects = [...projectCounts.values()]
    .filter((p) => p.triggerCount >= RECURRING_SAFETY_BLOCK_MIN_COUNT)
    .sort((a, b) => b.triggerCount - a.triggerCount || a.projectName.localeCompare(b.projectName));

  return {
    organizationId: filter.organizationId,
    windowHours: filter.hours,
    generatedAt: new Date().toISOString(),
    safetyBlock: {
      triggeredCount: blockedChangeIds.length,
      laterCompletedCount,
      laterFailedCount,
      laterCancelledCount,
      stillPendingCount,
    },
    approvalGate: {
      approvalRequiredCount: approvalRequiredChanges.length,
      approvedThenCompletedCount,
      approvedThenFailedCount,
    },
    recurringSafetyBlockProjects,
  };
}

// Phase 60 - Feedback-Schleife: core/change-risk.ts fragt hierueber ab, ob
// GENAU DAS Projekt eines neuen Change wiederholt den Safety Block
// ausgeloest hat, um dies als eigenen, benannten Risikofaktor fuer
// KUENFTIGE Changes desselben Projekts einzubeziehen ("Effectiveness-Daten
// fliessen zurueck in Governance/Decision Context"). Dieselbe
// Fensterbreite wie RECENTLY_FAILED_CHANGES_WINDOW_HOURS waere zu kurz fuer
// ein systemisches Muster - stattdessen ein eigener, laengerer, hier
// dokumentierter Rueckblick (30 Tage: lang genug, um ein wiederkehrendes
// Governance-Problem zu erkennen, kurz genug, um nicht laengst behobene
// Vorfaelle ewig nachwirken zu lassen).
export const SAFETY_BLOCK_RECURRENCE_LOOKBACK_HOURS = 24 * 30;

export async function getSafetyBlockTriggerCountForProject(organizationId: string, projectId: string, hours = SAFETY_BLOCK_RECURRENCE_LOOKBACK_HOURS): Promise<number> {
  const { projectCounts } = await indexBlockedChangesByProject(organizationId, hours);
  return projectCounts.get(projectId)?.triggerCount ?? 0;
}
