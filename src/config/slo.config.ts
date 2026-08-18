// Phase 22 Auftragspunkt 7 "Burn Rate" - Schwellenwerte als Konfiguration
// behandelt (nicht hart an eine UI-Komponente gekoppelt), analog zu
// config/notification-policy.config.ts (Phase 21) und config/health.config.ts.
// Eigene, dokumentierte Annahmen (keine externe SRE-Vorgabe vorhanden) -
// gaengige Branchenwerte (Google SRE Workbook nennt 2x/damit "Budget in
// 15 Tagen statt 30 aufgebraucht" bzw. hoehere Multiplikatoren fuer kuerzere
// Fenster); hier bewusst vereinfacht auf zwei feste Stufen statt eines
// mehrstufigen Multi-Window-Systems (Auftragspunkt 6 "keine komplizierte
// Forecasting-Engine bauen").
export const BURN_RATE_WARNING_MULTIPLIER = 2;
export const BURN_RATE_CRITICAL_MULTIPLIER = 5;

// Auftragspunkt 21 "Background Evaluation" - Drosselung des Hintergrund-
// Evaluators (core/slo-evaluator.ts), analog zu core/api-usage-intelligence.ts
// (CHECK_INTERVAL_MS = 2 Minuten). Laeuft im bestehenden Scheduler-Tick
// (core/monitor.ts), kein eigener Timer/Scheduler.
export const SLO_EVALUATION_INTERVAL_MS = 2 * 60 * 1000;

// "error" fuer API_ERROR_RATE/API_AVAILABILITY-SLIs - identische Schwelle
// wie die bereits bestehende Konvention in db/api-key-usage.repository.ts
// (getOrganizationUsageSignals: status_code >= 400 gilt dort ebenfalls als
// Fehler) - keine zweite, abweichende Definition von "API-Fehler" einfuehren.
export const API_ERROR_STATUS_CODE_THRESHOLD = 400;
