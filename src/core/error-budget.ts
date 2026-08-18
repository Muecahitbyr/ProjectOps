import { BURN_RATE_CRITICAL_MULTIPLIER, BURN_RATE_WARNING_MULTIPLIER } from "../config/slo.config";
import type { ErrorBudget, SliType, SloStatus } from "../types/slo.types";

// Phase 22 Auftragspunkt 6/7 "Error Budget"/"Burn Rate" - reine, ungespeicherte
// Berechnung aus (Ziel, aktueller SLI-Wert). Bewusst KEINE Forecasting-Engine
// (Auftrag verbietet das explizit) - nur der aktuelle Verbrauch/Burn-Rate.
//
// Zwei SLI-Familien mit gegensaetzlicher Richtung:
// - "hoeher ist besser" (AVAILABILITY/LATENCY/API_AVAILABILITY): das Budget
//   ist die erlaubte Differenz zum Ziel (z.B. Ziel 99.9% -> Budget 0.1%).
// - "niedriger ist besser" (ERROR_RATE/API_ERROR_RATE): das Ziel IST bereits
//   das Budget selbst (z.B. Ziel "< 1%" -> Budget 1%, der gemessene Wert
//   verbraucht direkt davon).
const INVERTED_SLI_TYPES: readonly SliType[] = ["ERROR_RATE", "API_ERROR_RATE"];

export function isInvertedSli(sliType: SliType): boolean {
  return INVERTED_SLI_TYPES.includes(sliType);
}

export function deriveSloStatus(burnRate: number): SloStatus {
  if (burnRate > BURN_RATE_CRITICAL_MULTIPLIER) return "CRITICAL";
  if (burnRate > BURN_RATE_WARNING_MULTIPLIER) return "DEGRADED";
  return "HEALTHY";
}

// Phase 34 "Enterprise SLO, SLA & Error-Budget Intelligence" - windowDays
// zusaetzlich hier hereingereicht (nicht mehr optional), um das bereits
// bestehende Prozent-Error-Budget zusaetzlich als ABSOLUTE Zeitspanne
// auszudruecken (siehe Auftrag Abschnitt 5, Beispiel "Error Budget ~= 43m
// 12s") - reine Multiplikation von totalBudgetPercent/consumedPercent mit
// der Fensterdauer in Minuten, keine zweite Berechnung, keine neue
// Datenquelle. estimatedHoursToExhaustion ist dieselbe reine Mathematik wie
// burnRate, nur zeitlich aufgeloest ("bei aktueller Burn-Rate ist das Budget
// in X Stunden aufgebraucht") - bewusst KEINE Forecasting-Engine (Phase 22
// hat ein Multi-Window-Burn-Rate-System explizit abgelehnt, siehe
// config/slo.config.ts-Kommentar; diese eine zusaetzliche Division bleibt im
// selben Rahmen: deterministisch, ungespeichert, aus bereits vorhandenen
// Werten abgeleitet).
export function computeErrorBudget(sliType: SliType, target: number, sliValue: number, windowDays: number): ErrorBudget {
  const inverted = isInvertedSli(sliType);

  const totalBudgetPercent = inverted ? target : 100 - target;
  const consumedPercent = inverted ? sliValue : 100 - sliValue;

  const remainingPercent = totalBudgetPercent - consumedPercent;
  // totalBudgetPercent > 0 ist durch die DB-CHECK-Constraint (target > 0 und
  // <= 100) fuer beide Richtungen garantiert - keine Division durch 0 moeglich.
  const remainingPercentOfBudget = Number(((remainingPercent / totalBudgetPercent) * 100).toFixed(2));
  const burnRate = Number((consumedPercent / totalBudgetPercent).toFixed(4));

  const windowMinutes = windowDays * 24 * 60;
  const totalBudgetMinutes = Number(((totalBudgetPercent / 100) * windowMinutes).toFixed(2));
  const consumedMinutes = Number(((consumedPercent / 100) * windowMinutes).toFixed(2));
  const remainingMinutes = Number(((remainingPercent / 100) * windowMinutes).toFixed(2));
  // burnRate=1 verbraucht per Definition genau 100% des Budgets ueber genau
  // eine Fensterdauer - die verbleibende Zeit bis zur Erschoepfung ist damit
  // (verbleibender Budget-Anteil) * Fensterdauer / burnRate. Nur definiert,
  // wenn ueberhaupt Budget verbraucht wird (burnRate > 0) UND noch Budget
  // uebrig ist (sonst bereits erschoepft/negativ, siehe status=CRITICAL).
  const estimatedHoursToExhaustion = burnRate > 0 && remainingPercentOfBudget > 0 ? Number(((windowDays * 24 * (remainingPercentOfBudget / 100)) / burnRate).toFixed(1)) : null;

  return {
    totalBudgetPercent: Number(totalBudgetPercent.toFixed(4)),
    consumedPercent: Number(consumedPercent.toFixed(4)),
    remainingPercent: Number(remainingPercent.toFixed(4)),
    remainingPercentOfBudget,
    totalBudgetMinutes,
    consumedMinutes,
    remainingMinutes,
    burnRate,
    estimatedHoursToExhaustion,
    status: deriveSloStatus(burnRate),
  };
}
