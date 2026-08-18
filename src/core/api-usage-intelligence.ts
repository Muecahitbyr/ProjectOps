import { getOrganizationUsageSignals } from "../db/api-key-usage.repository";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";
import { dispatchWebhookEvent } from "./webhook-dispatch";
import { recordAuditLog } from "./audit-log";
import { logger } from "./logger";

// Phase 19 Auftragspunkt 5 "Realtime" (API_USAGE_THRESHOLD_WARNING/
// API_USAGE_SPIKE_DETECTED) - laeuft im bestehenden Scheduler-Tick
// (core/monitor.ts, alle ~30s), aber intern gedrosselt (analog zu core/
// idempotency-cleanup.ts) - eine ueber alle Organisationen gruppierte
// Analyseabfrage alle 30s waere unnoetig haeufig fuer ein Signal, das per
// Definition ueber Minuten hinweg gemittelt wird.
const CHECK_INTERVAL_MS = 2 * 60 * 1000;
let lastCheckAt = 0;

// Schwellenwerte - eigene, dokumentierte Annahmen (keine externe Vorgabe
// vorhanden), mit einer Mindest-Anfragezahl als Rauschsperre (eine
// Organisation mit 2 Requests in 15 Minuten, davon 1 Fehler, hat keine
// "50% Fehlerquote" im operativen Sinn) und einer Hysterese-Bandbreite
// (fire bei UEberschreiten des oberen, re-arm erst beim Unterschreiten des
// unteren Werts) - verhindert Dauerspam bei einem Wert, der knapp um die
// Schwelle herum schwankt.
const ERROR_RATE_MIN_REQUESTS = 20;
const ERROR_RATE_FIRE_PERCENT = 25;
const ERROR_RATE_CLEAR_PERCENT = 15;

const SPIKE_MIN_BASELINE = 3;
const SPIKE_MIN_RECENT_REQUESTS = 30;
const SPIKE_FIRE_MULTIPLIER = 3;
const SPIKE_CLEAR_MULTIPLIER = 1.5;

// In-Memory statt DB-Spalte (wie core/api-usage-broadcast.ts) - reiner
// Betriebszustand fuer die Hysterese, keine sicherheitsrelevante Garantie,
// bei einem Neustart einfach wieder von "gesund" ausgehend.
const errorRateWarningActive = new Set<string>();
const spikeActive = new Set<string>();

async function notifyThresholdWarning(organizationId: string, errorRatePercent: number, recentTotal15m: number): Promise<void> {
  const payload = { organizationId, thresholdPercent: errorRatePercent, recentRequests: recentTotal15m, windowMinutes: 15 };
  broadcast(createEvent(RealtimeEventType.API_USAGE_THRESHOLD_WARNING, payload));
  await dispatchWebhookEvent("API_USAGE_THRESHOLD_WARNING", payload, organizationId);
  void recordAuditLog({
    action: "API_USAGE_THRESHOLD_WARNING",
    category: "SYSTEM",
    severity: "WARNING",
    message: `Erhoehte API-Fehlerquote erkannt: ${errorRatePercent}% ueber die letzten 15 Minuten (${recentTotal15m} Requests)`,
    metadata: { organizationId, errorRatePercent, recentTotal15m },
  });
}

async function notifySpikeDetected(organizationId: string, multiplierPercent: number, recentRequests5m: number): Promise<void> {
  const payload = { organizationId, thresholdPercent: multiplierPercent, recentRequests: recentRequests5m, windowMinutes: 5 };
  broadcast(createEvent(RealtimeEventType.API_USAGE_SPIKE_DETECTED, payload));
  await dispatchWebhookEvent("API_USAGE_SPIKE_DETECTED", payload, organizationId);
  void recordAuditLog({
    action: "API_USAGE_SPIKE_DETECTED",
    category: "SYSTEM",
    severity: "WARNING",
    message: `Anfrage-Spike erkannt: ${recentRequests5m} Requests in 5 Minuten (${multiplierPercent}% der eigenen Baseline)`,
    metadata: { organizationId, recentRequests5m, multiplierPercent },
  });
}

export async function checkApiUsageIntelligenceIfDue(): Promise<void> {
  const now = Date.now();
  if (now - lastCheckAt < CHECK_INTERVAL_MS) {
    return;
  }
  lastCheckAt = now;

  const signals = await getOrganizationUsageSignals();
  const seenOrgIds = new Set<string>();

  for (const signal of signals) {
    seenOrgIds.add(signal.organizationId);

    // Fehlerquoten-Warnung (Uebergang gesund -> auffaellig, Hysterese).
    const errorRatePercent = signal.recentTotal15m === 0 ? 0 : Math.round((signal.recentErrors15m / signal.recentTotal15m) * 1000) / 10;
    const isWarning = errorRateWarningActive.has(signal.organizationId);
    if (!isWarning && signal.recentTotal15m >= ERROR_RATE_MIN_REQUESTS && errorRatePercent >= ERROR_RATE_FIRE_PERCENT) {
      errorRateWarningActive.add(signal.organizationId);
      await notifyThresholdWarning(signal.organizationId, errorRatePercent, signal.recentTotal15m);
    } else if (isWarning && errorRatePercent < ERROR_RATE_CLEAR_PERCENT) {
      errorRateWarningActive.delete(signal.organizationId);
    }

    // Spike-Erkennung (Uebergang gesund -> auffaellig, Hysterese).
    const isSpiking = spikeActive.has(signal.organizationId);
    const baseline = signal.baselinePer5Min;
    if (!isSpiking && baseline >= SPIKE_MIN_BASELINE && signal.recentRequests5m >= SPIKE_MIN_RECENT_REQUESTS && signal.recentRequests5m >= baseline * SPIKE_FIRE_MULTIPLIER) {
      spikeActive.add(signal.organizationId);
      const multiplierPercent = Math.round((signal.recentRequests5m / baseline) * 100);
      await notifySpikeDetected(signal.organizationId, multiplierPercent, signal.recentRequests5m);
    } else if (isSpiking && baseline > 0 && signal.recentRequests5m < baseline * SPIKE_CLEAR_MULTIPLIER) {
      spikeActive.delete(signal.organizationId);
    }
  }

  // Organisationen ohne jede Aktivitaet in diesem Tick tauchen nicht in
  // `signals` auf - ohne diesen Aufraeumschritt wuerde ein einmal
  // ausgeloester Zustand nie zuruecksetzen, sobald eine Organisation
  // komplett inaktiv wird (statt "gesund").
  for (const organizationId of errorRateWarningActive) {
    if (!seenOrgIds.has(organizationId)) errorRateWarningActive.delete(organizationId);
  }
  for (const organizationId of spikeActive) {
    if (!seenOrgIds.has(organizationId)) spikeActive.delete(organizationId);
  }

  logger.debug("API-Usage-Intelligence-Check abgeschlossen", {
    organizationsChecked: signals.length,
    activeErrorRateWarnings: errorRateWarningActive.size,
    activeSpikes: spikeActive.size,
  });
}
