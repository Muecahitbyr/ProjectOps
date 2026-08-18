import { getApiAvailabilitySli, getApiErrorRateSli, getAvailabilitySli, getErrorRateSli, getLatencySli } from "../db/sli.repository";
import { getLatestSloEvaluation, recordSloEvaluation } from "../db/slo.repository";
import { computeErrorBudget } from "./error-budget";
import type { ErrorBudget, Slo, SloStatus } from "../types/slo.types";

export interface SloCurrentState {
  sliValue: number;
  sampleCount: number;
  errorBudget: ErrorBudget;
}

// Phase 22 - EIN zentraler Einstiegspunkt fuer "wie wird eine SLO gerade
// ausgewertet", verwendet von core/slo-evaluator.ts (Hintergrund-Snapshot),
// routes/platform-slo.routes.ts + routes/v1/slo.routes.ts (GET .../status,
// live statt auf den naechsten Scheduler-Tick zu warten) UND
// alerts/alert-evaluator.ts (SLO_BREACH/SLO_BURN_RATE-Metrik) - dieselbe
// Berechnung ueberall, keine zweite, potenziell abweichende Kopie.
export async function computeSloCurrentState(slo: Slo, from: Date, to: Date): Promise<SloCurrentState> {
  let sliValue: number;
  let sampleCount: number;

  switch (slo.sliType) {
    case "AVAILABILITY": {
      const result = await getAvailabilitySli(slo.projectId!, slo.checkId, from, to);
      sliValue = result.value;
      sampleCount = result.sampleCount;
      break;
    }
    case "ERROR_RATE": {
      const result = await getErrorRateSli(slo.projectId!, slo.checkId, from, to);
      sliValue = result.value;
      sampleCount = result.sampleCount;
      break;
    }
    case "LATENCY": {
      const result = await getLatencySli(slo.projectId!, slo.checkId, slo.latencyThresholdMs!, from, to);
      sliValue = result.value;
      sampleCount = result.sampleCount;
      break;
    }
    case "API_AVAILABILITY": {
      const result = await getApiAvailabilitySli(slo.organizationId, from, to);
      sliValue = result.value;
      sampleCount = result.sampleCount;
      break;
    }
    case "API_ERROR_RATE": {
      const result = await getApiErrorRateSli(slo.organizationId, from, to);
      sliValue = result.value;
      sampleCount = result.sampleCount;
      break;
    }
  }

  return { sliValue, sampleCount, errorBudget: computeErrorBudget(slo.sliType, slo.target, sliValue, slo.windowDays) };
}

export function sloWindow(slo: Slo, now: Date = new Date()): { from: Date; to: Date } {
  const to = now;
  const from = new Date(to.getTime() - slo.windowDays * 24 * 60 * 60 * 1000);
  return { from, to };
}

export interface SloStatusResult {
  sliValue: number;
  errorBudget: ErrorBudget;
  status: SloStatus;
  evaluatedAt: string;
}

// Auftragspunkt 20 "Performance" - GET .../status liest bevorzugt den
// juengsten, bereits vom Hintergrund-Evaluator (core/slo-evaluator.ts)
// gespeicherten Snapshot (guenstige, indizierte Abfrage) statt bei JEDEM
// Dashboard-Aufruf erneut ueber Rohdaten zu aggregieren. Nur direkt nach dem
// Anlegen einer SLO (vor dem ersten Scheduler-Tick) wird einmalig live
// nachgerechnet und sofort als erster Snapshot gespeichert.
export async function getSloCurrentStatus(slo: Slo): Promise<SloStatusResult> {
  const latest = await getLatestSloEvaluation(slo.id);
  if (latest) {
    return {
      sliValue: latest.sliValue,
      errorBudget: computeErrorBudget(slo.sliType, latest.target, latest.sliValue, slo.windowDays),
      status: latest.status,
      evaluatedAt: latest.evaluatedAt,
    };
  }

  const { from, to } = sloWindow(slo);
  const { sliValue, errorBudget } = await computeSloCurrentState(slo, from, to);
  const snapshot = await recordSloEvaluation({
    sloId: slo.id,
    sliValue,
    target: slo.target,
    errorBudgetRemainingPercent: errorBudget.remainingPercentOfBudget,
    burnRate: errorBudget.burnRate,
    status: errorBudget.status,
  });
  return { sliValue, errorBudget, status: errorBudget.status, evaluatedAt: snapshot.evaluatedAt };
}
