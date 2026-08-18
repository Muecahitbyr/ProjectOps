// Phase 49 "Enterprise Risk Forecasting & Proactive Operations Intelligence" -
// reine Orchestrierung, KEINE neue Signalquelle: core/capacity-intelligence.ts
// #buildCapacityWatchlist() (Phase 46) bleibt die einzige Stelle, die
// forecast-basierte Fruehwarnsignale berechnet. Dieses Modul erkennt
// lediglich echte Uebergaenge (In-Memory-Hysterese, KEINE neue Tabelle,
// exakt nach dem in core/resilience-alerting.ts (Phase 38) etablierten
// Muster) und leitet sie an die bestehende Notification-/Webhook-/
// Automation-Pipeline weiter. Zusaetzlich: eine retrospektive
// Forecast-Genauigkeits-Auswertung ueber dieselbe audit_log-Infrastruktur,
// die Phase 45 fuer Acknowledgment-Outcomes bereits etabliert hat.
import { listOrganizations } from "../db/organizations.repository";
import { getProjectIdsForOrganization } from "../db/projects.repository";
import { getServiceByProjectId } from "../db/services.repository";
import { buildCapacityWatchlist } from "./capacity-intelligence";
import { buildResilienceOverview } from "./service-resilience";
import { CRITICALITY_RANK } from "./business-impact";
import { createAuditLogEntry, listAuditEntriesForProjectActions } from "../db/audit-log.repository";
import { dispatchNotificationEvent } from "../notifications/notification-event.service";
import { dispatchWebhookEvent } from "./webhook-dispatch";
import { evaluateAutomationTriggers } from "../automation/automation-engine";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";
import { logger } from "./logger";
import { PROACTIVE_RISK_ALERT_INTERVAL_MS, PROACTIVE_RISK_WINDOW_HOURS, PROACTIVE_RISK_CANDIDATE_LIMIT, PROACTIVE_RISK_MIN_CRITICALITY_RANK } from "../config/proactive-risk.config";
import type { AuditLogEntry } from "../types/audit.types";
import type { ForecastAccuracyOutcome, ForecastAccuracySummary, ProactiveRiskDetectionRecord } from "../types/proactive-risk.types";

const DETECTED_ACTION = "PROACTIVE_RISK_DETECTED";
const CLEARED_ACTION = "PROACTIVE_RISK_CLEARED";
// Derselbe Uebergangs-Trail wie core/resilience-alerting.ts/core/outcome-
// intelligence.ts - fuer die Genauigkeitsauswertung wird NUR "zu CRITICAL
// oder AT_RISK" als "die Warnung ist eingetroffen" gewertet (eine
// Verschlechterung nach DEGRADED allein ist zu schwach, um eine Fruehwarnung
// als "bestaetigt" zu werten).
const DEGRADED_ACTION = "RESILIENCE_STATUS_DEGRADED";

// Forecast-Fenster fuer die Genauigkeitsbewertung - identisch zur bereits in
// db/forecast.repository.ts fest verdrahteten FORECAST_DAYS=7 (Phase 13),
// die core/capacity-intelligence.ts's Signale ausschliesslich verwenden -
// keine zweite, abweichende Fensterannahme.
const FORECAST_WINDOW_DAYS = 7;

let lastCheckAt = 0;
// In-Memory statt DB-Spalte - reiner Betriebszustand (siehe Dateikopf).
// Schluessel: projectId (eine proaktive Warnung ist projektbezogen, wie
// core/capacity-intelligence.ts's Watchlist). Anders als core/resilience-
// alerting.ts's lastStatusByProjectId (jedes Projekt erscheint IMMER in
// buildResilienceOverview()'s Zeilen) verschwindet ein Projekt hier
// VOLLSTAENDIG aus der Watchlist, sobald der Trend endet - der Kontext
// (Organisation/Namen) muss deshalb HIER mitgespeichert werden, sonst waere
// er beim Erkennen des Verschwindens nicht mehr verfuegbar.
interface ActiveProactiveRisk {
  organizationId: string;
  projectName: string;
  serviceId: number;
  serviceName: string;
}
const activeProactiveRisks = new Map<string, ActiveProactiveRisk>();

async function notifyDetection(
  organizationId: string,
  projectId: string,
  projectName: string,
  serviceId: number,
  serviceName: string,
  criticality: string,
  signalTitles: string[],
  explanation: string,
): Promise<void> {
  const realtimePayload = { projectId, projectName, organizationId, serviceId, serviceName, state: "DETECTED" as const };
  void dispatchWebhookEvent("PROACTIVE_RISK_CHANGED", realtimePayload, organizationId);
  void dispatchNotificationEvent({
    type: "PROACTIVE_RISK_DETECTED",
    projectId,
    projectName,
    // MEDIUM statt HIGH/CRITICAL - dieselbe Regel wie Phase 43's
    // FORECAST_SIGNAL_TYPES: jede forecast-basierte Aussage ist unsicherer
    // als ein bereits eingetretener Zustand.
    severity: "WARNING",
    title: `Proactive risk detected: ${serviceName}`,
    message: `${serviceName} is currently healthy but shows a degrading forecast trend: ${explanation}`,
    timestamp: new Date().toISOString(),
    metadata: { projectId, serviceId, organizationId, criticality, signalTitles },
  });
  void evaluateAutomationTriggers("PROACTIVE_RISK_DETECTED", projectId, { severity: "WARNING" });

  try {
    const entry = await createAuditLogEntry({
      action: DETECTED_ACTION,
      category: "SERVICE",
      severity: "WARNING",
      projectId,
      message: `Proactive risk detected for "${serviceName}": ${explanation}`,
      metadata: { organizationId, serviceId, serviceName, criticality, signalTitles, explanation, forecastDays: FORECAST_WINDOW_DAYS },
    });
    broadcast(createEvent(RealtimeEventType.AUDIT_CREATED, entry));
  } catch (err) {
    logger.error("Proactive-Risk-Detection konnte nicht protokolliert werden", {
      projectId,
      error: err instanceof Error ? err.message : "Unbekannter Fehler",
    });
  }
}

async function notifyCleared(organizationId: string, projectId: string, projectName: string, serviceId: number | null, serviceName: string | null): Promise<void> {
  const realtimePayload = { projectId, projectName, organizationId, serviceId, serviceName, state: "CLEARED" as const };
  void dispatchWebhookEvent("PROACTIVE_RISK_CHANGED", realtimePayload, organizationId);
  void dispatchNotificationEvent({
    type: "PROACTIVE_RISK_CLEARED",
    projectId,
    projectName,
    severity: "INFO",
    title: `Proactive risk cleared: ${serviceName ?? projectName}`,
    message: `${serviceName ?? projectName} no longer shows a degrading forecast trend.`,
    timestamp: new Date().toISOString(),
    metadata: { projectId, serviceId, organizationId },
  });
  void evaluateAutomationTriggers("PROACTIVE_RISK_CLEARED", projectId, { severity: "INFO" });

  try {
    const entry = await createAuditLogEntry({
      action: CLEARED_ACTION,
      category: "SERVICE",
      severity: "INFO",
      projectId,
      message: `Proactive risk cleared for "${serviceName ?? projectName}"`,
      metadata: { organizationId, serviceId },
    });
    broadcast(createEvent(RealtimeEventType.AUDIT_CREATED, entry));
  } catch (err) {
    logger.error("Proactive-Risk-Clearance konnte nicht protokolliert werden", {
      projectId,
      error: err instanceof Error ? err.message : "Unbekannter Fehler",
    });
  }
}

export async function evaluateProactiveRiskAlertsIfDue(): Promise<void> {
  const now = Date.now();
  if (now - lastCheckAt < PROACTIVE_RISK_ALERT_INTERVAL_MS) {
    return;
  }
  lastCheckAt = now;

  const organizations = await listOrganizations();
  const seenProjectIds = new Set<string>();

  for (const organization of organizations) {
    try {
      const watchlist = await buildCapacityWatchlist({ organizationId: organization.id, hours: PROACTIVE_RISK_WINDOW_HOURS, limit: PROACTIVE_RISK_CANDIDATE_LIMIT });
      // Nur HEALTHY Projekte - ein bereits nicht-gesundes Projekt wird
      // bereits von core/resilience-alerting.ts (Phase 38) abgedeckt; eine
      // zweite Meldung fuer denselben, bereits eingetretenen Zustand waere
      // redundantes Rauschen (Auftragspunkt "keine redundante Engine").
      const qualifying = watchlist.entries.filter((entry) => entry.resilienceStatus === "HEALTHY");

      for (const entry of qualifying) {
        if (!entry.serviceId) continue;
        const service = await getServiceByProjectId(entry.projectId);
        if (!service || CRITICALITY_RANK[service.criticality] < PROACTIVE_RISK_MIN_CRITICALITY_RANK) continue;

        seenProjectIds.add(entry.projectId);
        if (activeProactiveRisks.has(entry.projectId)) continue;
        const serviceName = entry.serviceName ?? entry.projectName;
        activeProactiveRisks.set(entry.projectId, { organizationId: organization.id, projectName: entry.projectName, serviceId: entry.serviceId, serviceName });

        const signalTitles = entry.capacitySignals.map((s) => s.title);
        const explanation = entry.capacitySignals.map((s) => s.explanation).join(" ");
        await notifyDetection(organization.id, entry.projectId, entry.projectName, entry.serviceId, serviceName, service.criticality, signalTitles, explanation);
      }
    } catch (err) {
      logger.error("Proactive-Risk-Auswertung fuer Organisation fehlgeschlagen", {
        organizationId: organization.id,
        error: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    }
  }

  // Projekte, die vorher aktiv waren, aber in diesem Tick nicht mehr
  // qualifizieren (Trend hat sich erledigt ODER Projekt/Organisation nicht
  // mehr sichtbar) - der gespeicherte Kontext (siehe ActiveProactiveRisk
  // oben) macht eine echte CLEARED-Meldung moeglich, statt das Projekt nur
  // stillschweigend aus der Hysterese zu entfernen (anders als core/
  // resilience-alerting.ts, das fuer diesen Fall keine Meldung noetig hat -
  // dort bleibt das Projekt in buildResilienceOverview()'s Zeilen sichtbar
  // und ein echter Uebergang wird stattdessen im Hauptlauf erkannt).
  for (const [projectId, risk] of [...activeProactiveRisks]) {
    if (seenProjectIds.has(projectId)) continue;
    activeProactiveRisks.delete(projectId);
    try {
      await notifyCleared(risk.organizationId, projectId, risk.projectName, risk.serviceId, risk.serviceName);
    } catch (err) {
      logger.error("Proactive-Risk-Clearance-Bereinigung fehlgeschlagen", { projectId, error: err instanceof Error ? err.message : "Unbekannter Fehler" });
    }
  }
}

// ---------------------------------------------------------------------------
// FORECAST-GENAUIGKEITS-AUSWERTUNG (Auftragspunkt 15 "Falscher Forecast" /
// Auftragspunkt 10 "Historisierung") - exakt dieselbe Fenster-/
// Klassifikationslogik wie core/outcome-intelligence.ts (Phase 45), hier auf
// PROACTIVE_RISK_DETECTED-Eintraege statt PRIORITY_QUEUE_ACKNOWLEDGED
// angewendet:
//   CONFIRMED:      eine echte Verschlechterung zu CRITICAL/AT_RISK trat
//                    innerhalb des Forecast-Fensters (7 Tage) NACH der
//                    Detection ein - die Fruehwarnung war zutreffend.
//   FALSE_POSITIVE:  das Fenster ist abgelaufen, ohne dass eine echte
//                    Verschlechterung eintrat - die Warnung war unbegruendet.
//   PENDING:         das Fenster ist noch nicht abgelaufen - noch keine
//                    Aussage moeglich (keine vorgetaeuschte Sicherheit).
// Bei mehreren Detections desselben Projekts begrenzt die JEWEILS NAECHSTE
// Detection das Auswertungsfenster der vorherigen (identisches Prinzip wie
// Phase 45's "naechste Bestaetigung begrenzt die vorherige").
// ---------------------------------------------------------------------------
function statusOfTransition(entry: AuditLogEntry): string | null {
  const value = entry.metadata?.newStatus;
  return typeof value === "string" ? value : null;
}

function classifyDetection(detectedAt: Date, nextDetectionAt: Date | null, degradedTransitions: AuditLogEntry[], now: Date): { outcome: ForecastAccuracyOutcome; outcomeReason: string } {
  const windowEnd = new Date(detectedAt.getTime() + FORECAST_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const scopeEnd = nextDetectionAt && nextDetectionAt < windowEnd ? nextDetectionAt : windowEnd;
  const windowElapsed = (nextDetectionAt !== null && nextDetectionAt <= windowEnd) || now >= windowEnd;

  const confirming = degradedTransitions.find((t) => {
    const at = new Date(t.createdAt);
    const newStatus = statusOfTransition(t);
    return at > detectedAt && at <= scopeEnd && at <= now && (newStatus === "CRITICAL" || newStatus === "AT_RISK");
  });

  if (confirming) {
    return { outcome: "CONFIRMED", outcomeReason: `A real degradation to ${statusOfTransition(confirming)} occurred on ${confirming.createdAt}, within the ${FORECAST_WINDOW_DAYS}-day forecast window.` };
  }
  if (windowElapsed) {
    return { outcome: "FALSE_POSITIVE", outcomeReason: `No real degradation to CRITICAL/AT_RISK occurred within the ${FORECAST_WINDOW_DAYS}-day forecast window - this warning did not materialize.` };
  }
  return { outcome: "PENDING", outcomeReason: `The ${FORECAST_WINDOW_DAYS}-day forecast window has not yet elapsed - not enough time has passed to judge this warning yet.` };
}

function groupByProject(entries: AuditLogEntry[]): Map<string, AuditLogEntry[]> {
  const map = new Map<string, AuditLogEntry[]>();
  for (const entry of entries) {
    if (!entry.projectId) continue;
    const list = map.get(entry.projectId) ?? [];
    list.push(entry);
    map.set(entry.projectId, list);
  }
  return map;
}

// restrictToProjectIds: dasselbe Team-Scoping-Bedarf wie core/outcome-
// intelligence.ts#getOutcomeIntelligenceSummary() (Phase 45) - team-
// gescopte v1-API-Keys duerfen nur die Detections ihrer eigenen Projekte
// sehen.
export async function getForecastAccuracySummary(organizationId: string, hours: number, restrictToProjectIds?: string[]): Promise<ForecastAccuracySummary> {
  const orgProjectIds = await getProjectIdsForOrganization(organizationId);
  const projectIds = restrictToProjectIds ? orgProjectIds.filter((id) => restrictToProjectIds.includes(id)) : orgProjectIds;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const now = new Date();

  const [detectionEntries, degradedEntries, overview] = await Promise.all([
    listAuditEntriesForProjectActions(projectIds, [DETECTED_ACTION], since),
    listAuditEntriesForProjectActions(projectIds, [DEGRADED_ACTION], since),
    buildResilienceOverview({ organizationId, hours }),
  ]);

  const detectionsByProject = groupByProject(detectionEntries);
  const degradedByProject = groupByProject(degradedEntries);
  const nameById = new Map(overview.rows.map((row) => [row.projectId, row.projectName]));

  const detections: ProactiveRiskDetectionRecord[] = [];
  const counts: Record<ForecastAccuracyOutcome, number> = { CONFIRMED: 0, FALSE_POSITIVE: 0, PENDING: 0 };

  for (const [projectId, projectDetections] of detectionsByProject) {
    const transitions = degradedByProject.get(projectId) ?? [];
    projectDetections.forEach((detection, index) => {
      const detectedAt = new Date(detection.createdAt);
      const nextDetectionAt = projectDetections[index + 1] ? new Date(projectDetections[index + 1]!.createdAt) : null;
      const { outcome, outcomeReason } = classifyDetection(detectedAt, nextDetectionAt, transitions, now);
      counts[outcome] += 1;

      const metadata = detection.metadata ?? {};
      detections.push({
        projectId,
        projectName: nameById.get(projectId) ?? projectId,
        serviceId: typeof metadata.serviceId === "number" ? metadata.serviceId : null,
        serviceName: typeof metadata.serviceName === "string" ? metadata.serviceName : null,
        criticality: typeof metadata.criticality === "string" ? metadata.criticality : null,
        detectedAt: detection.createdAt,
        clearedAt: null,
        signalTitles: Array.isArray(metadata.signalTitles) ? (metadata.signalTitles as string[]) : [],
        explanation: typeof metadata.explanation === "string" ? metadata.explanation : "",
        outcome,
        outcomeReason,
      });
    });
  }

  detections.sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());
  const evaluatedDetections = counts.CONFIRMED + counts.FALSE_POSITIVE;

  return {
    organizationId,
    windowHours: hours,
    generatedAt: now.toISOString(),
    totalDetections: detections.length,
    evaluatedDetections,
    confirmedCount: counts.CONFIRMED,
    falsePositiveCount: counts.FALSE_POSITIVE,
    pendingCount: counts.PENDING,
    accuracyRatePercent: evaluatedDetections > 0 ? Number(((counts.CONFIRMED / evaluatedDetections) * 100).toFixed(1)) : null,
    detections,
  };
}
