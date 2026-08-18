// Phase 51 "Enterprise Decision Execution & Closed-Loop Operations" -
// Drosselung des Hintergrund-Evaluators (core/automation-outcome-
// verification.ts), analog zu config/resilience-alerts.config.ts (Phase 38)
// und config/proactive-risk.config.ts (Phase 49). 5 Minuten - haeufig genug,
// um Executions zeitnah nach Ablauf ihres Verifikationsfensters zu pruefen,
// ohne den Tick unnoetig zu belasten.
export const AUTOMATION_OUTCOME_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

// Wie lange nach Abschluss einer Execution gewartet wird, bevor ihr
// operatives Ergebnis bewertet wird. Automation-Aktionen (Health-Check,
// Cache-Clear, Container-Neustart, ...) sind auf schnelle, synchrone Wirkung
// ausgelegt (siehe automation/safe-action-runner.ts) - bewusst VIEL kuerzer
// als Phase 45's 7-Tage-Fenster fuer menschliche Bestaetigungen oder Phase
// 49's 7-Tage-Forecast-Fenster, da eine Automatisierung keine Tage braucht,
// um zu wirken.
export const AUTOMATION_OUTCOME_VERIFICATION_WINDOW_MINUTES = 30;

// Wie weit zurueck der periodische Sweep nach noch unverifizierten,
// erfolgreichen Executions sucht - begrenzt die Kandidatenmenge je Tick
// (Auftragspunkt 13 "keine unnoetigen Queries"/"grosse Execution-
// Historien"). Executions, die aelter sind, werden nicht mehr nachtraeglich
// verifiziert (ihr Fenster ist laengst abgelaufen, das Ergebnis waere
// ohnehin NOT_IMPROVED bei fehlender Transition - kein Informationsverlust,
// nur eine bewusste zeitliche Grenze).
export const AUTOMATION_OUTCOME_SWEEP_LOOKBACK_HOURS = 24;

// Bounded Kandidaten je Tick - dieselbe Vorsicht wie jede andere bounded
// Top-N-Uebersicht in diesem System (Phase 43/46/47/48/49).
export const AUTOMATION_OUTCOME_SWEEP_LIMIT = 50;

// Nur Executions, deren automation_actions.trigger auf ein TATSAECHLICH
// bereits bestehendes Problem zurueckgeht, koennen sinnvoll auf
// "Verbesserung" geprueft werden - eine proaktive (PROACTIVE_RISK_DETECTED,
// Phase 49) oder manuell ausgeloeste Aktion ohne Problem-Trigger hat kein
// "Ausgangsproblem", das sich verbessern koennte (Auftragspunkt "keine
// kuenstliche Praezision" - eine erfundene Bewertung waere hier schlimmer
// als keine).
export const CORRECTIVE_AUTOMATION_TRIGGERS: readonly string[] = [
  "PROJECT_CRITICAL",
  "PROJECT_WARNING",
  "CHECK_FAILED",
  "RESILIENCE_DEGRADED",
  "ALERT_TRIGGERED",
  "INCIDENT_CREATED",
  "ROOT_INCIDENT_CREATED",
];

// Phase 52 "Continuous Operational Assurance" - Nachbeobachtungsfenster fuer
// die Durability-Re-Evaluation EINER bereits als IMPROVED verifizierten
// Execution. 24h statt der urspruenglichen 30 Minuten (Phase 51): die
// initiale Verifikation misst die SOFORTIGE Wirkung, die Durability-Pruefung
// misst, ob diese Wirkung angehalten hat - ein sinnvoll laengerer, aber
// weiterhin klar begrenzter Horizont (kein "fuer immer", da eine
// Verschlechterung Tage spaeter kausal kaum noch der urspruenglichen Aktion
// zuzuschreiben ist).
export const AUTOMATION_OUTCOME_DRIFT_WINDOW_HOURS = 24;

// Bounded Sweep-Fenster fuer die Durability-Kandidaten (Auftragspunkt "keine
// unnoetigen Queries") - nur Verifikationen, deren Drift-Fenster GERADE
// abgelaufen ist, werden ueberhaupt geprueft; aeltere fallen natuerlich aus
// der Kandidatenmenge heraus (kein zusaetzlicher "bereits geprueft"-Marker
// fuer den Normalfall noetig, siehe core/automation-outcome-verification.ts).
export const AUTOMATION_OUTCOME_DRIFT_SWEEP_LOOKBACK_HOURS = 48;

// Phase 53 "Enterprise Operational Learning & Optimization" -
// SCHWELLENWERT-DOKUMENTATION (Auftragspunkt "keine beliebigen Zahlen ohne
// Begruendung", dieselbe Konvention wie core/remediation-effectiveness.ts):
// TRACK_RECORD_MIN_SAMPLE:        dieselbe Groessenordnung wie
//                                  RECURRING_PATTERN_MIN_COUNT (Phase 45) /
//                                  RECURRING_OUTCOME_FAILURE_THRESHOLD
//                                  (Phase 50) - 3 gleichartige Ereignisse
//                                  gelten in dieser Codebase durchgaengig als
//                                  "kein Zufall mehr". Darunter:
//                                  INSUFFICIENT_DATA statt einer erfundenen
//                                  Praezision aus 1-2 Datenpunkten.
// EFFECTIVE_RATIO / INEFFECTIVE_RATIO: 70%/30%, symmetrisch um 50% - dieselbe
//                                  Groessenordnung wie Phase 36's
//                                  BURN_RATE_IMPROVE_FACTOR/REGRESS_FACTOR
//                                  (0.5/1.5 um den Referenzwert 1.0). Der
//                                  Bereich dazwischen (30-70%) ist MIXED -
//                                  ein echter gemischter Befund darf nicht
//                                  kuenstlich zu EFFECTIVE/INEFFECTIVE
//                                  gerundet werden.
// LOOKBACK_HOURS:                  90 Tage - derselbe Wert wie
//                                  core/decision-context.ts
//                                  #OUTCOME_HISTORY_LOOKBACK_HOURS (Phase 50),
//                                  keine neue Zeitraum-Konvention erfunden.
export const AUTOMATION_OUTCOME_TRACK_RECORD_MIN_SAMPLE = 3;
export const AUTOMATION_OUTCOME_TRACK_RECORD_EFFECTIVE_RATIO = 0.7;
export const AUTOMATION_OUTCOME_TRACK_RECORD_INEFFECTIVE_RATIO = 0.3;
export const AUTOMATION_OUTCOME_TRACK_RECORD_LOOKBACK_HOURS = 24 * 90;
