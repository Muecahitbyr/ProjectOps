// Phase 38 "Enterprise Resilience Alerting & Notification Intelligence" -
// Drosselung des Hintergrund-Evaluators (core/resilience-alerting.ts),
// analog zu config/slo.config.ts#SLO_EVALUATION_INTERVAL_MS. Laeuft im
// bestehenden Scheduler-Tick (core/monitor.ts), kein eigener Timer.
// 5 statt 2 Minuten (SLO-Vorbild), eigene dokumentierte Annahme: der
// Resilience-Status kombiniert mehrere, selbst schon traege Signale
// (Reliability-Fenster, SLO-Auswertung alle 2min) - eine engere Taktung
// wuerde nur denselben, kaum veraenderten Zustand haeufiger neu berechnen.
export const RESILIENCE_ALERT_INTERVAL_MS = 5 * 60 * 1000;

// Fenstergroesse fuer die periodische Hintergrund-Auswertung - bewusst
// kuerzer als der Standard-Frontend-Filter (7d, siehe pages/Resilience.tsx):
// Alerting soll den AKTUELLEN Zustand widerspiegeln, kein wochenlanges
// Reliability-Fenster in die Statusklassifikation einfliessen lassen.
export const RESILIENCE_ALERT_WINDOW_HOURS = 24;
