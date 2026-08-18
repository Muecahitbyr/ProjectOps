// Phase 29 "Enterprise Change Intelligence, Risk Correlation & Deployment
// Safety" - Pre-Change-Risk-Intelligence.
//
// Bestandsanalyse: core/topology.ts#getFullImpactAnalysis() liefert bereits
// Blast Radius (affectedServices/depthGroups/criticalPaths/spofCandidates)
// UND "related signals" (offene Incidents/at-risk SLOs/getriggerte Alerts)
// fuer den Service-Katalog - GENAU die in Auftragspunkt 1 geforderten
// Signale "Service Dependencies/Blast Radius", "bestehende Incidents",
// "SLO-/Alert-Signale". Dieses Modul baut KEINE zweite Impact-/Topology-
// Engine, sondern aggregiert deren Ergebnis (einmal pro zugeordnetem
// Service des Change, ueber den bestehenden 15s-Cache in topology.ts - kein
// N+1, siehe Auftragspunkt 12) zusammen mit den beiden tatsaechlich
// fehlenden Signalen: kuerzlich fehlgeschlagene Changes (neue, batchte
// Repository-Funktion) und Deployment-/Maintenance-Konflikte (bestehende
// Repositories, siehe core/change-lifecycle.ts/db/deployments.repository.ts).
//
// Score-Philosophie (Auftragspunkt 2): additive, benannte Punkte-Faktoren
// (jeder mit Label + Begruendung) statt eines Black-Box-Modells - der Score
// IST die Summe der angezeigten Faktoren, keine verborgene Gewichtung.
// BLOCKED wird bewusst NICHT allein durch einen Score-Schwellwert
// ausgeloest (das waere wieder ein Stueck Black-Box), sondern ausschliesslich
// durch explizite, benannte "blockers" (Auftragspunkt 3: "BLOCKED nur bei
// klar definierten, nachvollziehbaren Bedingungen").
import { getFullImpactAnalysis } from "./topology";
import { getServicesByIds } from "../db/services.repository";
import { listRecentlyFailedChangesForServices } from "../db/changes.repository";
import { getActiveMaintenanceWindow } from "../db/maintenance.repository";
import { getRecentDeploymentsForProject, getDeploymentById } from "../db/deployments.repository";
import { getSafetyBlockTriggerCountForProject, RECURRING_SAFETY_BLOCK_MIN_COUNT } from "./control-effectiveness";
import type { Change, ChangeWithServices } from "../types/change.types";
import type { Service } from "../types/service.types";
import type { FullImpactAnalysis } from "./topology";
import type { Deployment } from "../types/deployment.types";

// Auftragspunkt 6 "Recent Deployments"/"Maintenance" - dieselben
// Standardwerte wie die bestehende Change<->Incident-Korrelation
// (types/change.types.ts#DEFAULT_CHANGE_CORRELATION_WINDOW_MINUTES) fuer
// "kuerzlich" bei Deployments; fuer fehlgeschlagene Changes ein kuerzeres,
// eigenes Fenster (24h - ein vor 3 Wochen fehlgeschlagener Change ist kein
// aktuelles Risikosignal mehr).
const RECENTLY_FAILED_CHANGES_WINDOW_HOURS = 24;
const RECENT_DEPLOYMENTS_WINDOW_MINUTES = 240;

export type ChangeSafetyVerdict = "SAFE" | "WARNING" | "BLOCKED";

export interface ChangeRiskFactor {
  key: string;
  label: string;
  points: number;
  detail: string;
}

export interface ChangeRiskBlocker {
  key: string;
  label: string;
  detail: string;
}

export interface AffectedCriticalService {
  id: number;
  name: string;
  criticality: Service["criticality"];
}

export interface ChangeRiskAnalysis {
  changeId: number;
  score: number;
  verdict: ChangeSafetyVerdict;
  factors: ChangeRiskFactor[];
  blockers: ChangeRiskBlocker[];
  dataGaps: string[];
  affectedCriticalServices: AffectedCriticalService[];
  blastRadius: {
    affectedServiceCount: number;
    maxDepthReached: number;
    spofCount: number;
    hasCriticalPath: boolean;
  };
  openIncidents: { id: number; serviceId: number; serviceName: string; severity: string; title: string }[];
  atRiskSlos: { id: number; serviceId: number; serviceName: string; name: string; status: string }[];
  triggeredAlerts: { id: number; serviceId: number; serviceName: string; name: string }[];
  recentlyFailedChanges: { id: number; title: string; actualEndAt: string | null }[];
  recentDeployments: { id: number; projectId: string; version: string; status: Deployment["status"]; deployedAt: string }[];
  linkedDeployment: { id: number; status: Deployment["status"]; version: string } | null;
  activeMaintenanceConflicts: { projectId: string; maintenanceWindowId: number; conflictingChangeId: number | null }[];
}

function addFactor(factors: ChangeRiskFactor[], key: string, label: string, points: number, detail: string): void {
  if (points <= 0) return;
  factors.push({ key, label, points, detail });
}

const RISK_LEVEL_POINTS: Record<Change["risk"], number> = { LOW: 0, MEDIUM: 10, HIGH: 25, CRITICAL: 40 };

export async function analyzeChangeRisk(change: ChangeWithServices): Promise<ChangeRiskAnalysis> {
  const factors: ChangeRiskFactor[] = [];
  const blockers: ChangeRiskBlocker[] = [];
  const dataGaps: string[] = [];

  addFactor(factors, "risk-level", `Change risk level: ${change.risk}`, RISK_LEVEL_POINTS[change.risk], `This change is self-classified as ${change.risk} risk.`);

  const services = await getServicesByIds(change.serviceIds);
  if (change.serviceIds.length === 0) {
    dataGaps.push("This change has no assigned services yet - risk cannot be meaningfully assessed until at least one service is linked.");
  } else if (services.length < change.serviceIds.length) {
    dataGaps.push("At least one assigned service could not be resolved (may have been deleted).");
  }

  const affectedCriticalServices: AffectedCriticalService[] = services
    .filter((s) => s.criticality === "CRITICAL")
    .map((s) => ({ id: s.id, name: s.name, criticality: s.criticality }));
  const highServiceCount = services.filter((s) => s.criticality === "HIGH").length;
  if (affectedCriticalServices.length > 0) {
    addFactor(
      factors,
      "critical-services",
      "Directly affects CRITICAL-rated service(s)",
      Math.min(affectedCriticalServices.length * 15, 30),
      `${affectedCriticalServices.length} of the directly assigned service(s) are catalogued as CRITICAL: ${affectedCriticalServices.map((s) => s.name).join(", ")}.`,
    );
  }
  if (highServiceCount > 0) {
    addFactor(factors, "high-services", "Directly affects HIGH-rated service(s)", Math.min(highServiceCount * 8, 16), `${highServiceCount} of the directly assigned service(s) are catalogued as HIGH criticality.`);
  }

  // Phase 59 "Enterprise Operational Scenario & Recovery Assurance" -
  // Bestandsanalyse-Ergebnis: change.rollbackPlan (Phase 28) wird seit jeher
  // gespeichert/zurueckgegeben, aber NIRGENDS ausgewertet - ein HIGH/CRITICAL-
  // Risk-Change ohne dokumentierten Rollback-Plan wurde bisher identisch
  // bewertet wie einer MIT vollstaendigem Plan. Nur relevant, wenn der
  // Change ohnehin schon meaningful riskant ist (selbst deklariertes
  // HIGH/CRITICAL-Risiko ODER direkt betroffene CRITICAL-Services) - ein
  // triviales LOW-Risk-Change braucht legitim keinen dokumentierten
  // Rueckweg, das waere sonst eine kuenstliche Pauschalstrafe. Bewusst KEIN
  // neuer Blocker (die beiden bestehenden Blocker sind objektive
  // Tatsachen ueber den AKTUELLEN Zustand, kein Ermessensfall) - nur ein
  // benannter, additiver Faktor, derselbe Massstab wie "critical-services".
  const isMeaningfullyRisky = change.risk === "HIGH" || change.risk === "CRITICAL" || affectedCriticalServices.length > 0;
  const hasRollbackPlan = Boolean(change.rollbackPlan && change.rollbackPlan.trim().length > 0);
  if (isMeaningfullyRisky && !hasRollbackPlan) {
    addFactor(
      factors,
      "no-rollback-plan",
      "No documented rollback plan",
      15,
      `This change is ${change.risk} risk${affectedCriticalServices.length > 0 ? " and directly affects CRITICAL-rated service(s)" : ""}, but has no documented rollback plan - if it needs to be reverted, there is no recorded path back.`,
    );
  }

  // Auftragspunkt 1 "Service Dependencies/Blast Radius" + "bestehende
  // Incidents"/"SLO-/Alert-Signale" - eine getFullImpactAnalysis()-Aufruf
  // je zugeordnetem Service (bereits 15s-gecacht in topology.ts, exakt
  // dasselbe Muster wie GET /changes/:id/impact), KEINE zweite
  // Signalquelle je Service.
  const impactAnalyses: FullImpactAnalysis[] = await Promise.all(services.map((s) => getFullImpactAnalysis(s)));

  const blastRadiusServiceIds = new Set<number>();
  let maxDepthReached = 0;
  let spofCount = 0;
  let hasCriticalPath = false;
  const openIncidentsMap = new Map<number, ChangeRiskAnalysis["openIncidents"][number]>();
  const atRiskSlosMap = new Map<number, ChangeRiskAnalysis["atRiskSlos"][number]>();
  const triggeredAlertsMap = new Map<number, ChangeRiskAnalysis["triggeredAlerts"][number]>();

  for (const analysis of impactAnalyses) {
    for (const s of analysis.affectedServices) blastRadiusServiceIds.add(s.id);
    maxDepthReached = Math.max(maxDepthReached, ...analysis.depthGroups.map((g) => g.depth), 0);
    spofCount += analysis.spofCandidates.length;
    hasCriticalPath = hasCriticalPath || analysis.criticalPaths.length > 0;
    for (const i of analysis.related.openIncidents) openIncidentsMap.set(i.id, i);
    for (const s of analysis.related.atRiskSlos) atRiskSlosMap.set(s.id, s);
    for (const a of analysis.related.triggeredAlerts) triggeredAlertsMap.set(a.id, { id: a.id, serviceId: a.serviceId, serviceName: a.serviceName, name: a.name });
  }

  if (blastRadiusServiceIds.size > 0) {
    addFactor(factors, "blast-radius", "Downstream blast radius", Math.min(blastRadiusServiceIds.size * 2, 20), `Up to ${blastRadiusServiceIds.size} other cataloged service(s) could be affected if the assigned service(s) degrade.`);
  }
  if (spofCount > 0) {
    addFactor(factors, "spof", "Single point of failure in blast radius", 10, `${spofCount} service(s) in the blast radius look like a single point of failure (multiple critical dependents, no visible redundancy).`);
  }

  const openIncidents = [...openIncidentsMap.values()];
  const criticalIncidents = openIncidents.filter((i) => i.severity === "CRITICAL");
  const highIncidents = openIncidents.filter((i) => i.severity === "HIGH");
  const otherIncidents = openIncidents.filter((i) => i.severity !== "CRITICAL" && i.severity !== "HIGH");
  addFactor(factors, "open-critical-incidents", "Open CRITICAL incident(s) in blast radius", Math.min(criticalIncidents.length * 15, 30), `${criticalIncidents.length} open CRITICAL incident(s) already affect service(s) in this blast radius.`);
  addFactor(factors, "open-high-incidents", "Open HIGH incident(s) in blast radius", Math.min(highIncidents.length * 8, 16), `${highIncidents.length} open HIGH incident(s) already affect service(s) in this blast radius.`);
  addFactor(factors, "open-other-incidents", "Open incident(s) in blast radius", Math.min(otherIncidents.length * 3, 9), `${otherIncidents.length} other open incident(s) affect service(s) in this blast radius.`);

  if (criticalIncidents.length > 0) {
    blockers.push({
      key: "open-critical-incident",
      label: "A CRITICAL incident is currently active on an affected service",
      detail: `Starting this change while ${criticalIncidents.map((i) => `"${i.title}" (${i.serviceName})`).join(", ")} is unresolved risks masking or worsening an active outage.`,
    });
  }

  const atRiskSlos = [...atRiskSlosMap.values()];
  const criticalSlos = atRiskSlos.filter((s) => s.status === "CRITICAL");
  const degradedSlos = atRiskSlos.filter((s) => s.status === "DEGRADED");
  addFactor(factors, "critical-slos", "SLO(s) in error-budget-critical state", Math.min(criticalSlos.length * 8, 16), `${criticalSlos.length} SLO(s) in this blast radius are currently CRITICAL (error budget exhausted or near-exhausted).`);
  addFactor(factors, "degraded-slos", "SLO(s) currently degraded", Math.min(degradedSlos.length * 4, 12), `${degradedSlos.length} SLO(s) in this blast radius are currently DEGRADED.`);

  const triggeredAlerts = [...triggeredAlertsMap.values()];
  addFactor(factors, "triggered-alerts", "Currently triggered alert(s)", Math.min(triggeredAlerts.length * 5, 15), `${triggeredAlerts.length} alert rule(s) in this blast radius are currently triggered.`);

  // Auftragspunkt 1 "kuerzlich fehlgeschlagene Changes" - eine EINZIGE
  // batchte Abfrage ueber ALLE zugeordneten Services (kein N+1).
  const recentlyFailed = change.serviceIds.length > 0 ? await listRecentlyFailedChangesForServices(change.serviceIds, RECENTLY_FAILED_CHANGES_WINDOW_HOURS) : [];
  const recentlyFailedOthers = recentlyFailed.filter((c) => c.id !== change.id);
  addFactor(
    factors,
    "recent-failures",
    "Recently failed change(s) on the same service(s)",
    Math.min(recentlyFailedOthers.length * 12, 24),
    `${recentlyFailedOthers.length} change(s) on the same service(s) failed within the last ${RECENTLY_FAILED_CHANGES_WINDOW_HOURS}h: ${recentlyFailedOthers.map((c) => `"${c.title}"`).join(", ")}.`,
  );

  // Auftragspunkt 6 "Deployment Safety" - das VERKNUEPFTE Deployment
  // dieses Change (falls vorhanden) selbst gegen die Risikoanalyse pruefen,
  // KEINE neue Deployment-Engine.
  let linkedDeployment: ChangeRiskAnalysis["linkedDeployment"] = null;
  if (change.deploymentId) {
    const deployment = await getDeploymentById(change.deploymentId);
    if (deployment) {
      linkedDeployment = { id: deployment.id, status: deployment.status, version: deployment.version };
      if (deployment.status === "FAILED") {
        addFactor(factors, "linked-deployment-failed", "Linked deployment has FAILED status", 25, `The deployment linked to this change (${deployment.version}) is recorded as FAILED.`);
      } else if (deployment.status === "IN_PROGRESS") {
        addFactor(factors, "linked-deployment-in-progress", "Linked deployment is still IN_PROGRESS", 10, `The deployment linked to this change (${deployment.version}) has not yet completed.`);
      }
    }
  }

  // Auftragspunkt 1/6 "kuerzlich erfolgte Deployments" + "Deployment-
  // Konflikte" - je BETROFFENEM PROJEKT (nicht je Service: mehrere Services
  // desselben Projekts teilen sich dieselben Deployments), bounded durch
  // die (typischerweise 1-3) distinct Projekte eines Change, dasselbe
  // Batching-Prinzip wie GET /changes/:id/impact (ein Aufruf je Service,
  // hier je distinct Projekt - kein N+1 im Sinne von "pro Datensatz in
  // einer grossen Liste").
  const projectIds = [...new Set(services.map((s) => s.projectId).filter((p): p is string => p !== null))];
  if (services.some((s) => s.projectId === null)) {
    dataGaps.push("At least one assigned service has no linked project, so its deployments/maintenance windows cannot be checked.");
  }

  const [recentDeploymentsByProject, activeMaintenanceByProject] = await Promise.all([
    Promise.all(projectIds.map((pid) => getRecentDeploymentsForProject(pid, new Date().toISOString(), RECENT_DEPLOYMENTS_WINDOW_MINUTES))),
    Promise.all(projectIds.map((pid) => getActiveMaintenanceWindow(pid))),
  ]);
  const recentDeployments = recentDeploymentsByProject.flat();
  const failedRecentDeployments = recentDeployments.filter((d) => d.status === "FAILED");
  addFactor(
    factors,
    "recent-deployment-failures",
    "Recent deployment failure(s) on affected project(s)",
    Math.min(failedRecentDeployments.length * 10, 20),
    `${failedRecentDeployments.length} deployment(s) on the affected project(s) failed within the last ${RECENT_DEPLOYMENTS_WINDOW_MINUTES / 60}h.`,
  );

  // Phase 60 "Enterprise Operational Policy & Control Effectiveness" -
  // Feedback-Schleife: core/control-effectiveness.ts wertet aus, OB der
  // bestehende Safety-Block-Control (Phase 29) bei einem Projekt
  // wiederholt ausgeloest wurde (>=3x in 30 Tagen) - ein systemisches
  // Muster, nicht ein einmaliger Ausrutscher. Genau dieselbe Ursache
  // wuerde diesen NEUEN Change wahrscheinlich erneut betreffen, daher hier
  // als eigener, benannter Faktor einbezogen statt nur retrospektiv
  // sichtbar zu sein.
  const safetyBlockCounts = await Promise.all(projectIds.map((pid) => getSafetyBlockTriggerCountForProject(change.organizationId, pid)));
  const maxRecurringSafetyBlocks = Math.max(0, ...safetyBlockCounts);
  if (maxRecurringSafetyBlocks >= RECURRING_SAFETY_BLOCK_MIN_COUNT) {
    addFactor(
      factors,
      "recurring-safety-blocks",
      "Recurring safety-block pattern on affected project(s)",
      Math.min(maxRecurringSafetyBlocks * 5, 20),
      `The safety check has already blocked ${maxRecurringSafetyBlocks} other change start attempt(s) on the same project(s) within the last 30 days - a recurring, not one-off, pattern.`,
    );
  }

  // Auftragspunkt 3 "Maintenance-Window-Konflikte" - ein Wartungsfenster
  // gehoert entweder ZU DIESEM Change (kein Konflikt, siehe
  // core/change-lifecycle.ts), oder es lief bereits VOR dem Start dieses
  // Change (ein anderer, aktuell laufender Change belegt dasselbe Projekt)
  // - NUR letzteres ist ein echter Konflikt.
  const activeMaintenanceConflicts: ChangeRiskAnalysis["activeMaintenanceConflicts"] = [];
  for (let i = 0; i < projectIds.length; i++) {
    const window = activeMaintenanceByProject[i];
    const projectId = projectIds[i];
    if (window && projectId && window.changeId !== null && window.changeId !== change.id) {
      activeMaintenanceConflicts.push({ projectId, maintenanceWindowId: window.id, conflictingChangeId: window.changeId });
    }
  }
  if (activeMaintenanceConflicts.length > 0) {
    blockers.push({
      key: "maintenance-conflict",
      label: "Another change is already in progress on an affected project",
      detail: `Project(s) ${activeMaintenanceConflicts.map((c) => `${c.projectId} (change #${c.conflictingChangeId})`).join(", ")} already have an active maintenance window from a different, currently running change.`,
    });
  }

  const score = Math.min(factors.reduce((sum, f) => sum + f.points, 0), 100);
  const verdict: ChangeSafetyVerdict = blockers.length > 0 ? "BLOCKED" : score >= 25 ? "WARNING" : "SAFE";

  return {
    changeId: change.id,
    score,
    verdict,
    factors,
    blockers,
    dataGaps,
    affectedCriticalServices,
    blastRadius: { affectedServiceCount: blastRadiusServiceIds.size, maxDepthReached, spofCount, hasCriticalPath },
    openIncidents,
    atRiskSlos,
    triggeredAlerts,
    recentlyFailedChanges: recentlyFailedOthers.map((c) => ({ id: c.id, title: c.title, actualEndAt: c.actualEndAt })),
    recentDeployments: recentDeployments.map((d) => ({ id: d.id, projectId: d.projectId, version: d.version, status: d.status, deployedAt: d.deployedAt })),
    linkedDeployment,
    activeMaintenanceConflicts,
  };
}

// Auftragspunkt 3 "Pre-Deployment Safety Check" wiederverwendet fuer den
// Start-Endpunkt (routes/changes.routes.ts) - EMERGENCY-Changes duerfen
// einen BLOCKED-Befund umgehen (dasselbe etablierte Prinzip wie die
// Freigabepflicht in config/change-management.config.ts: ein Notfall-
// Change darf den normalen Prozess umgehen, muss dafuer aber eine
// Begruendung mitbringen und wird vollstaendig auditiert).
export function isSafetyBlockOverridable(change: Pick<Change, "changeType">): boolean {
  return change.changeType === "EMERGENCY";
}
