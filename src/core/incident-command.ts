// Phase 32 "Enterprise Incident Command Center & Operational Coordination" -
// reine Aggregationsschicht. JEDES verwendete Signal kommt aus einer
// bereits bestehenden Engine (siehe Importe unten) - dieses Modul fuehrt
// KEINE eigene Risiko-/Impact-/Eskalations-/Recovery-Berechnung durch,
// sondern ruft ausschliesslich die bereits etablierten, wiederverwendeten
// Funktionen parallel auf (Promise.all - Auftragspunkt 20 "keine N+1").
import { listCommandRolesForIncident, listChecklistRowsForIncident, getLastCommandUpdateAt } from "../db/incident-command.repository";
import { getIncidentEscalationSummary } from "./incident-escalation";
import { listRecoveryActionsForIncident } from "./recovery-safety";
import { listCommunicationsForIncident } from "../db/incident-communications.repository";
import { buildCommunicationRecommendations } from "./incident-communication";
import { getServiceByProjectId } from "../db/services.repository";
import { getFullImpactAnalysis } from "./topology";
import { getRecentChangesForService, listServiceIdsForChange } from "../db/changes.repository";
import { getRecentDeploymentsForProject } from "../db/deployments.repository";
import { analyzeChangeRisk } from "./change-risk";
import { getPostmortemByIncidentId, listActionItems } from "../db/postmortems.repository";
import { getIncidentTimeline } from "../db/incident-timeline.repository";
// Phase 35 "Enterprise Problem Management & Root-Cause Intelligence"
// Auftragspunkt 15/19 "Command Center Integration" - reine Anzeige/
// Verknuepfung, keine Duplizierung dieser Command-Architektur. Schlankes
// Summary (id/title/status/priority), keine vollen Problem-Detaildaten.
import { getRelatedProblemSummaries } from "./problem-management";
import { DEFAULT_CHANGE_CORRELATION_WINDOW_MINUTES } from "../types/change.types";
import { DEFAULT_DEPLOYMENT_CORRELATION_WINDOW_MINUTES } from "../types/deployment.types";
import { CHECKLIST_ITEM_KEYS } from "../types/incident-command.types";
import type { Incident } from "../types/incident.types";
import type { ChecklistItem, IncidentCommandState } from "../types/incident-command.types";

// Auftragspunkt 5 "Checklist" - fehlende Items werden als OPEN abgeleitet
// (Migration 0055: nur tatsaechlich veraenderte Items werden gespeichert).
export async function getCommandState(incidentId: number): Promise<IncidentCommandState> {
  const [roles, rows, lastUpdatedAt] = await Promise.all([
    listCommandRolesForIncident(incidentId),
    listChecklistRowsForIncident(incidentId),
    getLastCommandUpdateAt(incidentId),
  ]);
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const checklist: ChecklistItem[] = CHECKLIST_ITEM_KEYS.map((key) => {
    const existing = byKey.get(key);
    return existing ? existing : { key, status: "OPEN", updatedBy: null, updatedAt: null };
  });
  return { roles, checklist, lastUpdatedAt };
}

export interface ChangeIntelligenceSummary {
  service: { id: number; name: string; criticality: string } | null;
  relevantChanges: { id: number; title: string; status: string; minutesBeforeIncident: number }[];
  relevantDeployments: { id: number; version: string; environment: string; status: string; minutesBeforeIncident: number }[];
  risk: Awaited<ReturnType<typeof analyzeChangeRisk>> | null;
}

// Auftragspunkt 14 "Change Intelligence" - wiederverwendet exakt dieselbe
// Korrelation wie core/incident-communication.ts (Phase 31) und fuer die
// TOP-korrelierte Change zusaetzlich die bestehende Phase-29-Risk-Engine
// (core/change-risk.ts#analyzeChangeRisk) - keine zweite Risk-Engine.
async function buildChangeIntelligence(incident: Incident): Promise<ChangeIntelligenceSummary> {
  const service = await getServiceByProjectId(incident.projectId);
  if (!service) {
    return { service: null, relevantChanges: [], relevantDeployments: [], risk: null };
  }

  const [recentChanges, recentDeployments] = await Promise.all([
    getRecentChangesForService(service.id, incident.createdAt, DEFAULT_CHANGE_CORRELATION_WINDOW_MINUTES),
    service.projectId ? getRecentDeploymentsForProject(service.projectId, incident.createdAt, DEFAULT_DEPLOYMENT_CORRELATION_WINDOW_MINUTES) : Promise.resolve([]),
  ]);

  const relevantChanges = recentChanges.map((c) => ({
    id: c.id,
    title: c.title,
    status: c.status,
    minutesBeforeIncident: Math.round((new Date(incident.createdAt).getTime() - new Date(c.actualStartAt ?? c.plannedStartAt ?? c.createdAt).getTime()) / 60_000),
  }));
  const relevantDeployments = recentDeployments.map((d) => ({
    id: d.id,
    version: d.version,
    environment: d.environment,
    status: d.status,
    minutesBeforeIncident: Math.round((new Date(incident.createdAt).getTime() - new Date(d.deployedAt).getTime()) / 60_000),
  }));

  const topChange = recentChanges[0];
  const risk = topChange
    ? await analyzeChangeRisk({ ...topChange, serviceIds: await listServiceIdsForChange(topChange.id) })
    : null;

  return {
    service: { id: service.id, name: service.name, criticality: service.criticality },
    relevantChanges,
    relevantDeployments,
    risk,
  };
}

export interface CommandOverview {
  incident: Incident;
  command: IncidentCommandState;
  escalation: Awaited<ReturnType<typeof getIncidentEscalationSummary>>;
  recovery: Awaited<ReturnType<typeof listRecoveryActionsForIncident>>;
  communications: { recent: Awaited<ReturnType<typeof listCommunicationsForIncident>>; recommendations: Awaited<ReturnType<typeof buildCommunicationRecommendations>> };
  changeIntelligence: ChangeIntelligenceSummary;
  impact: { affectedServiceCount: number; maxDepthReached: number; spofCount: number; hasCriticalPath: boolean } | null;
  postmortem: { exists: boolean; status: string | null; actionItemCount: number; openActionItemCount: number };
  timeline: { totalEvents: number; recent: Awaited<ReturnType<typeof getIncidentTimeline>> };
  relatedProblems: Awaited<ReturnType<typeof getRelatedProblemSummaries>>;
}

// Auftragspunkt 4 "Incident Command Status" - EIN Response, alle Signale
// parallel geladen (Promise.all), jede einzelne Quelle ist eine bereits
// bestehende, getestete Funktion aus einer frueheren Phase.
export async function buildCommandOverview(incident: Incident): Promise<CommandOverview> {
  const [command, escalation, recovery, communicationsRecent, communicationsRecommendations, changeIntelligence, service, timeline, relatedProblems] = await Promise.all([
    getCommandState(incident.id),
    getIncidentEscalationSummary(incident),
    listRecoveryActionsForIncident(incident),
    listCommunicationsForIncident(incident.id),
    buildCommunicationRecommendations(incident),
    buildChangeIntelligence(incident),
    getServiceByProjectId(incident.projectId),
    getIncidentTimeline(incident.id),
    getRelatedProblemSummaries(incident.id),
  ]);

  const impact = service
    ? await getFullImpactAnalysis(service).then((a) => ({
        affectedServiceCount: a.affectedServices.length,
        maxDepthReached: Math.max(0, ...a.depthGroups.map((g) => g.depth)),
        spofCount: a.spofCandidates.length,
        hasCriticalPath: a.criticalPaths.length > 0,
      }))
    : null;

  const postmortem = await getPostmortemByIncidentId(incident.id);
  const actionItems = postmortem ? await listActionItems(postmortem.id) : [];

  return {
    incident,
    command,
    escalation,
    recovery,
    communications: { recent: communicationsRecent.slice(0, 5), recommendations: communicationsRecommendations },
    changeIntelligence,
    impact,
    postmortem: {
      exists: postmortem !== undefined,
      status: postmortem?.status ?? null,
      actionItemCount: actionItems.length,
      openActionItemCount: actionItems.filter((i) => i.status !== "DONE").length,
    },
    timeline: { totalEvents: timeline.length, recent: timeline.slice(-10).reverse() },
    relatedProblems,
  };
}
