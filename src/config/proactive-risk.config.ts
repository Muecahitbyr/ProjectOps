// Phase 49 "Enterprise Risk Forecasting & Proactive Operations Intelligence" -
// Drosselung des Hintergrund-Evaluators (core/proactive-risk-alerting.ts),
// analog zu config/resilience-alerts.config.ts (Phase 38). 15 statt 5
// Minuten (Resilience-Alerting-Vorbild): die zugrunde liegenden
// Forecast-Trends (core/capacity-intelligence.ts, Phase 46) beruhen auf
// einer 30-Tage-Regression und aendern sich innerhalb von Minuten praktisch
// nie - eine engere Taktung wuerde nur denselben, kaum veraenderten
// Forecast haeufiger neu berechnen (mehrere buildServiceResilienceDetail()-
// Aufrufe je Organisation).
export const PROACTIVE_RISK_ALERT_INTERVAL_MS = 15 * 60 * 1000;

// Fenstergroesse fuer die zugrunde liegende Resilience-/Capacity-Uebersicht -
// identisch zu RESILIENCE_ALERT_WINDOW_HOURS (Phase 38), aus demselben Grund
// (aktueller Zustand, kein wochenlanges Fenster).
export const PROACTIVE_RISK_WINDOW_HOURS = 24;

// Bounded Kandidaten je Organisation und Tick - dieselbe Vorsicht wie jede
// andere bounded Top-N-Uebersicht (Phase 43/46/47/48), hier bewusst klein,
// da dies ein Hintergrund-Tick ueber ALLE Organisationen ist (nicht ein
// einzelner On-Demand-Request).
export const PROACTIVE_RISK_CANDIDATE_LIMIT = 10;

// Auftragspunkt "Business Criticality als Rausch-Filter" - nur Services ab
// dieser Kritikalitaets-Stufe (services.criticality, Phase 23) loesen eine
// AKTIVE Benachrichtigung aus. Niedrigere Stufen bleiben weiterhin in der
// passiven Capacity Watchlist (Phase 46) sichtbar, erzeugen aber keinen
// Alert-Spam fuer geschaeftlich nachrangige Services.
export const PROACTIVE_RISK_MIN_CRITICALITY_RANK = 1; // 0=LOW, 1=MEDIUM, 2=HIGH, 3=CRITICAL
