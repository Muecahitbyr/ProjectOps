// Phase 31 "Enterprise Change/Incident Communication & Stakeholder
// Notification Intelligence" - zwei reine, lesende Funktionen:
//   1. evaluateCommunicationSafety() - Safety-Gate vor dem tatsaechlichen
//      Senden (Auftragspunkt 6), keine kuenstliche Persistierung.
//   2. buildCommunicationRecommendations() - Vorschlaege (Auftragspunkt 5),
//      NIEMALS automatischer Versand. Aggregiert AUSSCHLIESSLICH bereits
//      bestehende Signale (Service-Impact/Blast-Radius aus Phase 25,
//      Change-/Deployment-Korrelation aus Phase 27-29, Recovery-Executions
//      aus Phase 30) - keine zweite Signalquelle.
import { getServiceByProjectId } from "../db/services.repository";
import { getFullImpactAnalysis } from "./topology";
import { getRecentChangesForService } from "../db/changes.repository";
import { getRecentDeploymentsForProject } from "../db/deployments.repository";
import { getLatestExecutionForIncident } from "../db/automation-executions.repository";
import { getAutomationActionById } from "../db/automation.repository";
import { getOrganizationMembership } from "../db/organizations.repository";
import { getOnCallScheduleOrganizationId } from "../db/on-call.repository";
import { getProjectOrganizationId } from "../db/projects.repository";
import { countCommunicationsForIncidentSince, getLatestCommunicationForTarget } from "../db/incident-communications.repository";
import { DEFAULT_CHANGE_CORRELATION_WINDOW_MINUTES } from "../types/change.types";
import { DEFAULT_DEPLOYMENT_CORRELATION_WINDOW_MINUTES } from "../types/deployment.types";
import type { Incident } from "../types/incident.types";
import type {
  CommunicationRecommendation,
  CommunicationSafetyResult,
  CommunicationTargetType,
} from "../types/incident-communication.types";

const LONG_RUNNING_MINUTES = 60;
// Phase 65 "Enterprise Platform Consolidation & Final Gap Analysis" -
// Konsolidierungsaudit fand denselben Konstantennamen mit einem anderen
// Wert in core/service-resilience.ts (dort 5, fuer ein Resilience-Signal).
// Bewusst NIEDRIGER hier: diese Schwelle entscheidet nur, ob dem Operator
// eine Stakeholder-Kommunikation EMPFOHLEN wird (folgenlos, jederzeit
// ignorierbar) - eine niedrigere, vorsichtigere Schwelle ist fuer diesen
// Zweck angemessen und beabsichtigt, keine Verwechslung/kein Bug.
const LARGE_BLAST_RADIUS_THRESHOLD = 3;
const COOLDOWN_MINUTES = 5;
const MAX_COMMUNICATIONS_PER_INCIDENT_PER_HOUR = 20;

function minutesSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 60_000;
}

// ---------------------------------------------------------------------------
// Auftragspunkt 6 "Communication Safety"
// ---------------------------------------------------------------------------
export interface CommunicationTargetInput {
  targetType: CommunicationTargetType;
  targetUserId?: string;
  targetScheduleId?: number;
}

export async function evaluateCommunicationSafety(
  incident: Incident,
  target: CommunicationTargetInput,
  message: string,
): Promise<CommunicationSafetyResult> {
  // "Ziel gehoert zur zulaessigen Organisation" - ueber das Projekt des
  // Incidents aufgeloest (dieselbe Tenant-Herleitung wie ueberall sonst in
  // diesem System, z.B. core/change-risk.ts).
  const organizationId = await getProjectOrganizationId(incident.projectId);
  if (!organizationId) {
    return { verdict: "BLOCKED", reason: "Projekt dieses Incidents ist keiner Organisation zugeordnet" };
  }

  if (target.targetType === "USER") {
    if (!target.targetUserId) {
      return { verdict: "INVALID_TARGET", reason: "targetUserId fehlt fuer target_type=USER" };
    }
    const membership = await getOrganizationMembership(organizationId, target.targetUserId);
    if (!membership) {
      return { verdict: "INVALID_TARGET", reason: "Zielbenutzer ist kein Mitglied der Organisation dieses Incidents" };
    }
  } else if (target.targetType === "ON_CALL_SCHEDULE") {
    if (target.targetScheduleId === undefined) {
      return { verdict: "INVALID_TARGET", reason: "targetScheduleId fehlt fuer target_type=ON_CALL_SCHEDULE" };
    }
    const scheduleOrgId = await getOnCallScheduleOrganizationId(target.targetScheduleId);
    if (!scheduleOrgId || scheduleOrgId !== organizationId) {
      return { verdict: "INVALID_TARGET", reason: "On-Call-Schedule nicht gefunden oder gehoert zu einer anderen Organisation" };
    }
  }

  // Rate-Limit (organisationsweite Quota existiert bereits fuer den
  // projektweiten Broadcast-Kanal, notifications/notification-event.service.ts
  // - hier zusaetzlich je Incident, da eine einzelne Person theoretisch viele
  // Kommunikationen auf EINEN Incident haeufen koennte).
  const recentCount = await countCommunicationsForIncidentSince(incident.id, 60);
  if (recentCount >= MAX_COMMUNICATIONS_PER_INCIDENT_PER_HOUR) {
    return { verdict: "BLOCKED", reason: `Rate-Limit erreicht: maximal ${MAX_COMMUNICATIONS_PER_INCIDENT_PER_HOUR} Kommunikationen je Incident und Stunde` };
  }

  const latest = await getLatestCommunicationForTarget(
    incident.id,
    target.targetType,
    target.targetUserId ?? null,
    target.targetScheduleId ?? null,
  );
  if (latest) {
    if (latest.message === message) {
      return { verdict: "ALREADY_SENT", reason: "Identische Kommunikation an dieses Ziel wurde fuer diesen Incident bereits gesendet" };
    }
    const elapsed = minutesSince(latest.createdAt);
    if (elapsed < COOLDOWN_MINUTES) {
      return { verdict: "COOLDOWN", reason: `Cooldown aktiv - naechste Kommunikation an dieses Ziel fruehestens in ${Math.ceil(COOLDOWN_MINUTES - elapsed)} Minute(n) moeglich` };
    }
  }

  return { verdict: "READY", reason: null };
}

// ---------------------------------------------------------------------------
// Auftragspunkt 5 "Automatische Communication Suggestions"
// ---------------------------------------------------------------------------
export async function buildCommunicationRecommendations(incident: Incident): Promise<CommunicationRecommendation[]> {
  const recommendations: CommunicationRecommendation[] = [];
  const isHighOrCritical = incident.severity === "HIGH" || incident.severity === "CRITICAL";
  if (!isHighOrCritical) return recommendations;

  const ageMinutes = minutesSince(incident.createdAt);

  if (incident.resolvedAt !== null) {
    recommendations.push({
      key: "INCIDENT_RESOLVED",
      severity: "INFO",
      title: "Incident resolved",
      message: `Incident "${incident.title}" wurde behoben.`,
      reason: "Der Incident wurde soeben als geloest markiert.",
    });
  } else {
    if (ageMinutes < 10) {
      recommendations.push({
        key: "INCIDENT_CREATED",
        severity: incident.severity === "CRITICAL" ? "CRITICAL" : "HIGH",
        title: "New incident",
        message: `Neuer ${incident.severity}-Incident: "${incident.title}".`,
        reason: `Incident wurde vor ${Math.round(ageMinutes)} Minute(n) neu erstellt.`,
      });
    }
    if (incident.lastEscalatedStep > 0) {
      recommendations.push({
        key: "INCIDENT_ESCALATED",
        severity: "HIGH",
        title: "Incident escalated",
        message: `Incident "${incident.title}" wurde auf Eskalationsstufe ${incident.lastEscalatedStep} angehoben.`,
        reason: `Aktuelle Eskalationsstufe: ${incident.lastEscalatedStep}.`,
      });
    }
    if (incident.acknowledgedAt !== null) {
      recommendations.push({
        key: "INCIDENT_ACKNOWLEDGED",
        severity: "INFO",
        title: "Incident acknowledged",
        message: `Incident "${incident.title}" wurde bestaetigt und wird bearbeitet.`,
        reason: "Der Incident wurde bestaetigt (acknowledged).",
      });
    }
    if (ageMinutes >= LONG_RUNNING_MINUTES) {
      recommendations.push({
        key: "LONG_RUNNING",
        severity: "WARNING",
        title: "Long-running incident",
        message: `Incident "${incident.title}" laeuft seit ueber ${LONG_RUNNING_MINUTES} Minuten.`,
        reason: `Incident-Dauer: ${Math.round(ageMinutes)} Minute(n), Schwellwert: ${LONG_RUNNING_MINUTES}.`,
      });
    }
  }

  // Service-Katalog/Blast-Radius (Phase 23/25) - dieselbe Engine wie
  // core/change-risk.ts, KEINE zweite Impact-Berechnung.
  const service = await getServiceByProjectId(incident.projectId);
  if (service) {
    const impact = await getFullImpactAnalysis(service);
    if (service.criticality === "CRITICAL") {
      recommendations.push({
        key: "CRITICAL_SERVICE",
        severity: "HIGH",
        title: "Critical service affected",
        message: `Incident betrifft den als CRITICAL eingestuften Service "${service.name}".`,
        reason: `Service-Kritikalitaet: CRITICAL.`,
      });
    }
    if (impact.affectedServices.length >= LARGE_BLAST_RADIUS_THRESHOLD) {
      recommendations.push({
        key: "LARGE_BLAST_RADIUS",
        severity: "HIGH",
        title: "Large blast radius",
        message: `Incident kann bis zu ${impact.affectedServices.length} weitere Services beeintraechtigen.`,
        reason: `Blast Radius: ${impact.affectedServices.length} Service(s), Schwellwert: ${LARGE_BLAST_RADIUS_THRESHOLD}.`,
      });
    }

    // Change-Korrelation (Phase 29-Muster: Changes VOR dem Incident).
    const recentChanges = await getRecentChangesForService(service.id, incident.createdAt, DEFAULT_CHANGE_CORRELATION_WINDOW_MINUTES);
    const latestChange = recentChanges[0];
    if (latestChange) {
      const changeMinutesBefore = Math.round(
        (new Date(incident.createdAt).getTime() - new Date(latestChange.actualStartAt ?? latestChange.plannedStartAt ?? latestChange.createdAt).getTime()) / 60_000,
      );
      recommendations.push({
        key: "CHANGE_CORRELATION",
        severity: "WARNING",
        title: "Correlates with a recent change",
        message: `Incident korreliert mit Change "${latestChange.title}" (#${latestChange.id}) vor ${changeMinutesBefore} Minute(n).`,
        reason: `Change #${latestChange.id} auf demselben Service ${changeMinutesBefore} Minute(n) vor Incident-Erstellung.`,
      });
    }

    // Deployment-Korrelation (Phase 27-Muster) - projektbasiert.
    if (service.projectId) {
      const recentDeployments = await getRecentDeploymentsForProject(service.projectId, incident.createdAt, DEFAULT_DEPLOYMENT_CORRELATION_WINDOW_MINUTES);
      const latestDeployment = recentDeployments[0];
      if (latestDeployment) {
        const deployMinutesBefore = Math.round((new Date(incident.createdAt).getTime() - new Date(latestDeployment.deployedAt).getTime()) / 60_000);
        recommendations.push({
          key: "DEPLOYMENT_CORRELATION",
          severity: "WARNING",
          title: "Correlates with a recent deployment",
          message: `Incident korreliert mit Deployment ${latestDeployment.version} vor ${deployMinutesBefore} Minute(n).`,
          reason: `Deployment #${latestDeployment.id} (${latestDeployment.environment}) ${deployMinutesBefore} Minute(n) vor Incident-Erstellung.`,
        });
      }
    }
  }

  // Recovery-Integration (Phase 30) - juengste abgeschlossene Ausfuehrung,
  // die zu DIESEM Incident gehoert.
  const latestExecution = await getLatestExecutionForIncident(incident.id);
  if (latestExecution) {
    const action = await getAutomationActionById(latestExecution.automationActionId);
    if (latestExecution.status === "SUCCESS") {
      recommendations.push({
        key: "RECOVERY_SUCCEEDED",
        severity: "INFO",
        title: "Recovery action succeeded",
        message: `Recovery Action${action ? ` "${action.action}"` : ""} erfolgreich abgeschlossen.`,
        reason: "Juengste Automation-Ausfuehrung fuer diesen Incident war erfolgreich.",
      });
    } else if (latestExecution.status === "FAILED") {
      recommendations.push({
        key: "RECOVERY_FAILED",
        severity: "HIGH",
        title: "Recovery action failed",
        message: `Recovery fehlgeschlagen${action ? ` ("${action.action}")` : ""} - Stakeholder-Kommunikation empfohlen.`,
        reason: "Juengste Automation-Ausfuehrung fuer diesen Incident ist fehlgeschlagen.",
      });
    }
  }

  return recommendations;
}
