import { listSlos, recordSloEvaluation } from "../db/slo.repository";
import { computeSloCurrentState, sloWindow } from "./slo-calculator";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";
import { recordAuditLog } from "./audit-log";
import { logger } from "./logger";
import { notifyImpactIfSignificant } from "./topology";
import { SLO_EVALUATION_INTERVAL_MS } from "../config/slo.config";
import type { Slo, SloStatus } from "../types/slo.types";

// Phase 22 Auftragspunkt 8/21 "SLO Breach Detection"/"Background Evaluation" -
// laeuft im bestehenden Scheduler-Tick (core/monitor.ts), intern selbst
// gedrosselt, EXAKT wie core/api-usage-intelligence.ts (Phase 19): kein
// zweiter Scheduler, kein zweites Incident-System - Breach/Recovery werden
// ausschliesslich ueber die bestehende Realtime-/Audit-Infrastruktur
// sichtbar gemacht (dieselbe Begruendung wie dort: ein organisationsweites/
// nicht zwingend an einen einzelnen fehlschlagenden Check gebundenes Signal
// erzwingt keinen kuenstlichen incidents-Datensatz - siehe Abschlussbericht
// "Architekturentscheidungen"). Projekt-gebundene SLOs koennen zusaetzlich
// ueber eine Alert-Regel (metric=SLO_BREACH/SLO_BURN_RATE, siehe
// alerts/alert-evaluator.ts) an die volle Eskalations-/Benachrichtigungs-
// Policy angebunden werden - diese Funktion hier ist die davon unabhaengige,
// fuer JEDE SLO garantierte Basis-Erkennung.
let lastCheckAt = 0;

// In-Memory statt DB-Spalte - reiner Betriebszustand fuer die
// Drei-Stufen-Hysterese (HEALTHY/DEGRADED/CRITICAL), bei einem Neustart
// wird wieder von "gesund" ausgegangen (identisches Verhalten zu Phase 19).
const lastStatusBySloId = new Map<number, SloStatus>();

type SloStatusEvent = RealtimeEventType.SLO_BREACHED | RealtimeEventType.SLO_RECOVERED | RealtimeEventType.SLO_BURN_RATE_WARNING;

async function notifyStatusChange(
  event: SloStatusEvent,
  slo: Slo,
  sliValue: number,
  burnRate: number,
  errorBudgetRemainingPercent: number,
): Promise<void> {
  const payload = { slo, sliValue, burnRate, errorBudgetRemainingPercent };
  if (event === RealtimeEventType.SLO_BREACHED) broadcast(createEvent(event, payload));
  else if (event === RealtimeEventType.SLO_RECOVERED) broadcast(createEvent(event, payload));
  else broadcast(createEvent(event, payload));
  const action = event === RealtimeEventType.SLO_BREACHED ? "SLO_BREACHED" : event === RealtimeEventType.SLO_RECOVERED ? "SLO_RECOVERED" : "SLO_BURN_RATE_WARNING";
  void recordAuditLog({
    action,
    category: "SLO",
    severity: event === RealtimeEventType.SLO_RECOVERED ? "INFO" : event === RealtimeEventType.SLO_BREACHED ? "CRITICAL" : "WARNING",
    ...(slo.projectId ? { projectId: slo.projectId } : {}),
    message:
      event === RealtimeEventType.SLO_RECOVERED
        ? `SLO "${slo.name}" wieder innerhalb des Ziels (SLI ${sliValue}%)`
        : `SLO "${slo.name}" ${event === RealtimeEventType.SLO_BREACHED ? "verletzt" : "Burn-Rate-Warnung"} (SLI ${sliValue}%, Burn-Rate ${burnRate}x)`,
    metadata: { sloId: slo.id, organizationId: slo.organizationId, sliValue, burnRate, errorBudgetRemainingPercent },
  });
}

export async function evaluateSlosIfDue(): Promise<void> {
  const now = Date.now();
  if (now - lastCheckAt < SLO_EVALUATION_INTERVAL_MS) {
    return;
  }
  lastCheckAt = now;

  const slos = await listSlos({ enabled: true });
  const seenIds = new Set<number>();

  for (const slo of slos) {
    seenIds.add(slo.id);
    try {
      const { from, to } = sloWindow(slo);
      const { sliValue, errorBudget } = await computeSloCurrentState(slo, from, to);

      void recordSloEvaluation({
        sloId: slo.id,
        sliValue,
        target: slo.target,
        errorBudgetRemainingPercent: errorBudget.remainingPercentOfBudget,
        burnRate: errorBudget.burnRate,
        status: errorBudget.status,
      });

      const previousStatus = lastStatusBySloId.get(slo.id) ?? "HEALTHY";
      const currentStatus = errorBudget.status;

      if (currentStatus !== previousStatus) {
        lastStatusBySloId.set(slo.id, currentStatus);
        if (currentStatus === "CRITICAL") {
          await notifyStatusChange(RealtimeEventType.SLO_BREACHED, slo, sliValue, errorBudget.burnRate, errorBudget.remainingPercentOfBudget);
          // Phase 25 "Automatische Integration" - fire-and-forget, laeuft
          // bereits im Hintergrund-Scheduler-Tick (evaluateSlosIfDue() ist
          // selbst gedrosselt, siehe Kommentar oben), blockiert also nichts
          // Zeitkritisches zusaetzlich. Nur SLOs MIT verknuepftem Projekt
          // (org-/API-weite SLOs haben keins) koennen einen Katalog-Service
          // treffen.
          if (slo.projectId) {
            void notifyImpactIfSignificant(slo.projectId, "SLO_BREACH", `SLO breached: ${slo.name}`);
          }
        } else if (currentStatus === "DEGRADED") {
          await notifyStatusChange(RealtimeEventType.SLO_BURN_RATE_WARNING, slo, sliValue, errorBudget.burnRate, errorBudget.remainingPercentOfBudget);
        } else if (previousStatus !== "HEALTHY") {
          await notifyStatusChange(RealtimeEventType.SLO_RECOVERED, slo, sliValue, errorBudget.burnRate, errorBudget.remainingPercentOfBudget);
        }
      }
    } catch (err) {
      logger.error("SLO-Auswertung fehlgeschlagen", {
        sloId: slo.id,
        error: err instanceof Error ? err.message : "Unbekannter Fehler",
      });
    }
  }

  // Analog zu core/api-usage-intelligence.ts: SLOs, die deaktiviert/geloescht
  // wurden, aus dem Hysterese-Zustand entfernen, sonst bliebe ein einmal
  // gesetzter Status fuer immer bestehen.
  for (const sloId of lastStatusBySloId.keys()) {
    if (!seenIds.has(sloId)) lastStatusBySloId.delete(sloId);
  }

  logger.debug("SLO-Auswertung abgeschlossen", { sloCount: slos.length });
}
