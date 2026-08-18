// Phase 22 "Enterprise Reliability, SLOs, SLA Monitoring & Service Health".
// Spiegelt db/migrations/0042_slo_and_reliability.sql.

export type SliType = "AVAILABILITY" | "ERROR_RATE" | "LATENCY" | "API_AVAILABILITY" | "API_ERROR_RATE";

// Wiederverwendet dasselbe 3-Zustands-Modell wie Auftragspunkt 2 verlangt
// ("wenn der bestehende Health-Status fachlich passt: wiederverwenden") -
// HealthStatus (types/health.types.ts) hat aber HEALTHY/WARNING/CRITICAL
// (Momentaufnahme aus aktuellen Check-Stati), waehrend eine SLO explizit
// einen dritten, eigenen Begriff braucht ("DEGRADED" = Burn-Rate-Warnung,
// noch kein tatsaechlicher Breach) - kein 1:1-Fit, daher ein eigener,
// bewusst analoger Typ statt einer Zweckentfremdung von HealthStatus.
export type SloStatus = "HEALTHY" | "DEGRADED" | "CRITICAL";

export interface Slo {
  id: number;
  organizationId: string;
  teamId: string | null;
  projectId: string | null;
  checkId: string | null;
  name: string;
  description: string | null;
  sliType: SliType;
  target: number;
  latencyThresholdMs: number | null;
  windowDays: number;
  enabled: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SloEvaluation {
  id: number;
  sloId: number;
  sliValue: number;
  target: number;
  errorBudgetRemainingPercent: number;
  burnRate: number;
  status: SloStatus;
  evaluatedAt: string;
}

// Auftragspunkt 6 "Error Budget" - reine Rechenwerte, nicht persistiert
// (werden live aus dem aktuellen SLI-Wert + Ziel berechnet, siehe
// core/error-budget.ts); slo_evaluations speichert nur das fertige Ergebnis
// als historischen Snapshot.
export interface ErrorBudget {
  totalBudgetPercent: number;
  consumedPercent: number;
  remainingPercent: number;
  remainingPercentOfBudget: number;
  // Phase 34 - dieselben Prozentwerte zusaetzlich als absolute Zeitspanne
  // (Minuten) ueber das SLO-Fenster, siehe core/error-budget.ts.
  totalBudgetMinutes: number;
  consumedMinutes: number;
  remainingMinutes: number;
  burnRate: number;
  // Phase 34 - "bei aktueller Burn-Rate in X Stunden aufgebraucht" (reine
  // Division, kein Forecasting). null, wenn burnRate<=0 (kein Verbrauch)
  // oder das Budget bereits erschoepft ist.
  estimatedHoursToExhaustion: number | null;
  status: SloStatus;
}

export interface SloWithCurrentStatus extends Slo {
  current: {
    sliValue: number;
    errorBudget: ErrorBudget;
    evaluatedAt: string | null;
  } | null;
}

export const SLI_TYPES: SliType[] = ["AVAILABILITY", "ERROR_RATE", "LATENCY", "API_AVAILABILITY", "API_ERROR_RATE"];

// Auftragspunkt 3 "SLI System" - unterstuetzte Auswertungsfenster fuer
// GET .../history (1h/24h/7d/30d).
export type SloHistoryWindow = "1h" | "24h" | "7d" | "30d";
export const SLO_HISTORY_WINDOW_HOURS: Record<SloHistoryWindow, number> = {
  "1h": 1,
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
};
