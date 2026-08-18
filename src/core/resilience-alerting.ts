// Phase 38 "Enterprise Resilience Alerting & Notification Intelligence" -
// reine Orchestrierung, KEINE neue Signalquelle: buildResilienceOverview()
// (Phase 37) bleibt die einzige Stelle, die resilienceStatus berechnet.
// Dieses Modul erkennt lediglich echte Uebergaenge und leitet sie an die
// bestehende Notification-Event-Pipeline (Phase 10/20/21) weiter - exakt
// nach dem in core/slo-evaluator.ts (Phase 22) bereits etablierten Muster:
// In-Memory-Hysterese (KEINE neue Tabelle, KEIN zweiter persistierter
// Status - bei einem Neustart wird wieder "von vorne" beobachtet, identisch
// zu slo-evaluator.ts's lastStatusBySloId), gedrosselt im bestehenden
// Scheduler-Tick (core/monitor.ts), kein eigener Timer.
import { listOrganizations } from "../db/organizations.repository";
import { buildResilienceOverview, RESILIENCE_RANK } from "./service-resilience";
import { dispatchNotificationEvent } from "../notifications/notification-event.service";
import { dispatchWebhookEvent } from "./webhook-dispatch";
import { evaluateAutomationTriggers } from "../automation/automation-engine";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";
import { recordAuditLog } from "./audit-log";
import { logger } from "./logger";
import { RESILIENCE_ALERT_INTERVAL_MS, RESILIENCE_ALERT_WINDOW_HOURS } from "../config/resilience-alerts.config";
import type { NotificationEventSeverity } from "../notifications/notification-event.types";
import type { AuditSeverity } from "../types/audit.types";
import type { ResilienceOverviewRow, ResilienceStatus } from "../types/resilience.types";

let lastCheckAt = 0;

// In-Memory statt DB-Spalte - reiner Betriebszustand, siehe Dateikopf.
// Schluessel: projectId (resilienceStatus ist projektbezogen, Phase 37).
const lastStatusByProjectId = new Map<string, ResilienceStatus>();

// Auftragspunkt "keine falschen Erholungsmeldungen" - ein Uebergang von/zu
// UNKNOWN bedeutet "keine Messdaten mehr/wieder vorhanden", NICHT "besser"
// oder "schlechter" geworden. Weder als DEGRADED- noch als RECOVERED-Event
// gemeldet (siehe notification-event.types.ts-Kommentar), aber weiterhin in
// der Hysterese-Map aktualisiert, damit ein spaeterer echter Uebergang (z.B.
// UNKNOWN -> CRITICAL) korrekt als neuer Uebergang erkannt wird.
function isReportable(previous: ResilienceStatus, next: ResilienceStatus): boolean {
  return previous !== "UNKNOWN" && next !== "UNKNOWN" && previous !== next;
}

const SEVERITY_BY_STATUS: Record<ResilienceStatus, NotificationEventSeverity> = {
  CRITICAL: "CRITICAL",
  AT_RISK: "HIGH",
  DEGRADED: "WARNING",
  HEALTHY: "INFO",
  UNKNOWN: "INFO",
};

// AuditSeverity (types/audit.types.ts) kennt nur INFO/WARNING/CRITICAL - kein
// eigenes "HIGH" wie NotificationEventSeverity. AT_RISK wird fuer den
// Audit-Log-Eintrag auf WARNING abgebildet (naechstliegende Stufe), die
// Notification-Event-Severity (mit vollem HIGH-Kanal-Routing) bleibt davon
// unberuehrt.
const AUDIT_SEVERITY_BY_STATUS: Record<ResilienceStatus, AuditSeverity> = {
  CRITICAL: "CRITICAL",
  AT_RISK: "WARNING",
  DEGRADED: "WARNING",
  HEALTHY: "INFO",
  UNKNOWN: "INFO",
};

async function notifyTransition(row: ResilienceOverviewRow, organizationId: string, previous: ResilienceStatus): Promise<void> {
  const degrading = RESILIENCE_RANK[row.resilienceStatus] > RESILIENCE_RANK[previous];
  const label = row.serviceName ?? row.projectName;

  const realtimePayload = {
    projectId: row.projectId,
    projectName: row.projectName,
    organizationId,
    serviceId: row.serviceId,
    serviceName: row.serviceName,
    previousStatus: previous,
    newStatus: row.resilienceStatus,
  };
  broadcast(createEvent(RealtimeEventType.RESILIENCE_STATUS_CHANGED, realtimePayload));

  // Phase 39 "Enterprise Resilience External API & Webhook Integration" -
  // dieselbe Nutzlast wie der Realtime-Broadcast (kein zweites Payload-
  // Format erfinden), an genau der Stelle ausgeloest, an der auch das
  // gleichnamige RealtimeEventType gebroadcastet wird - identisches Muster
  // zu jeder anderen dispatchWebhookEvent()-Aufrufstelle in diesem System
  // (siehe core/webhook-dispatch.ts).
  void dispatchWebhookEvent("RESILIENCE_STATUS_CHANGED", realtimePayload, organizationId);

  void dispatchNotificationEvent({
    type: degrading ? "RESILIENCE_STATUS_DEGRADED" : "RESILIENCE_STATUS_RECOVERED",
    projectId: row.projectId,
    projectName: row.projectName,
    severity: SEVERITY_BY_STATUS[row.resilienceStatus],
    title: degrading ? `Resilience degraded: ${label}` : `Resilience recovered: ${label}`,
    message: degrading
      ? `${label} changed from ${previous} to ${row.resilienceStatus}. Open the Resilience detail page for the contributing signals.`
      : `${label} recovered from ${previous} to ${row.resilienceStatus}.`,
    timestamp: new Date().toISOString(),
    metadata: { projectId: row.projectId, serviceId: row.serviceId, organizationId, previousStatus: previous, newStatus: row.resilienceStatus },
  });

  void recordAuditLog({
    action: degrading ? "RESILIENCE_STATUS_DEGRADED" : "RESILIENCE_STATUS_RECOVERED",
    category: "SERVICE",
    severity: AUDIT_SEVERITY_BY_STATUS[row.resilienceStatus],
    projectId: row.projectId,
    message: `Resilience status for "${label}" changed from ${previous} to ${row.resilienceStatus}`,
    metadata: { organizationId, serviceId: row.serviceId, previousStatus: previous, newStatus: row.resilienceStatus },
  });

  // Phase 40 "Enterprise Resilience-Driven Automation" - dieselbe generische
  // Trigger-Funktion, die bereits von core/monitor.ts (PROJECT_CRITICAL/
  // WARNING)/alerts/alert-evaluator.ts/incidents/incident-correlation.ts/
  // core/incident-escalation.ts aufgerufen wird (automation/automation-
  // engine.ts) - keine neue Automatisierungs-Engine. severity/healthScore
  // nutzen die bereits vorhandene Regel-Filterung (rule.minSeverity/
  // conditions.healthScoreBelow), keine neue Bedingungs-Mechanik.
  void evaluateAutomationTriggers(degrading ? "RESILIENCE_DEGRADED" : "RESILIENCE_RECOVERED", row.projectId, {
    severity: SEVERITY_BY_STATUS[row.resilienceStatus],
    healthScore: row.healthScore,
  });
}

export async function evaluateResilienceAlertsIfDue(): Promise<void> {
  const now = Date.now();
  if (now - lastCheckAt < RESILIENCE_ALERT_INTERVAL_MS) {
    return;
  }
  lastCheckAt = now;

  const organizations = await listOrganizations();
  const seenProjectIds = new Set<string>();

  for (const organization of organizations) {
    try {
      const overview = await buildResilienceOverview({ organizationId: organization.id, hours: RESILIENCE_ALERT_WINDOW_HOURS });
      for (const row of overview.rows) {
        seenProjectIds.add(row.projectId);
        const previous = lastStatusByProjectId.get(row.projectId);
        lastStatusByProjectId.set(row.projectId, row.resilienceStatus);

        // undefined = allererste Beobachtung dieses Projekts - Baseline
        // setzen, aber KEINEN Uebergang melden (kein Rauschen bei
        // Serverstart/neuem Projekt, identisch zu slo-evaluator.ts's
        // Behandlung von "previousStatus ?? HEALTHY" beim ersten Tick,
        // hier aber explizit statt implizit ueber ein Default).
        if (previous === undefined) continue;
        if (!isReportable(previous, row.resilienceStatus)) continue;

        await notifyTransition(row, organization.id, previous);
      }
    } catch (err) {
      logger.error("Resilience-Alert-Auswertung fuer Organisation fehlgeschlagen", {
        organizationId: organization.id,
        error: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    }
  }

  // Analog zu core/slo-evaluator.ts/core/api-usage-intelligence.ts:
  // geloeschte/nicht mehr sichtbare Projekte aus dem Hysterese-Zustand
  // entfernen, sonst bliebe ein einmal gesetzter Status fuer immer bestehen.
  for (const projectId of lastStatusByProjectId.keys()) {
    if (!seenProjectIds.has(projectId)) lastStatusByProjectId.delete(projectId);
  }

  logger.debug("Resilience-Alert-Auswertung abgeschlossen", { organizationCount: organizations.length, projectCount: seenProjectIds.size });
}
