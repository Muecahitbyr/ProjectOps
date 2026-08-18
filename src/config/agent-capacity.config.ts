// Phase 55 "Enterprise Capacity & Resource Optimization" -
// SCHWELLENWERT-DOKUMENTATION (Auftragspunkt "keine beliebigen Zahlen ohne
// Begruendung", dieselbe Konvention wie core/remediation-effectiveness.ts/
// core/service-resilience.ts):
//
// SWEEP_INTERVAL_MS:  15 Minuten - dieselbe Groessenordnung wie Phase 49's
//                      proaktiver Forecast-Sweep (core/proactive-risk-
//                      alerting.ts), da Disk-/Memory-Trends sich ueber
//                      Stunden/Tage entwickeln, nicht Sekunden.
// WARNING_THRESHOLD:   80% der bekannten Gesamtkapazitaet (agent.diskTotalMb/
//                      ramMb) - dieselbe "80% Referenzgroesse" wie
//                      HEALTH_SCORE_PROJECTED_THRESHOLD (core/service-
//                      resilience.ts, Phase 42): ein allgemein etablierter,
//                      bereits in diesem System verwendeter Massstab fuer
//                      "nicht mehr komfortabel Luft nach oben".
// CLEAR_THRESHOLD:     65% - dieselbe Hysterese-Idee wie Phase 19's
//                      ERROR_RATE_FIRE_PERCENT(25)/CLEAR_PERCENT(15) (ca.
//                      15 Prozentpunkte Abstand), verhindert Alert-Flattern
//                      bei einem Wert, der knapp um die Warnschwelle
//                      schwankt.
export const AGENT_CAPACITY_SWEEP_INTERVAL_MS = 15 * 60 * 1000;
export const AGENT_CAPACITY_WARNING_THRESHOLD_PERCENT = 80;
export const AGENT_CAPACITY_CLEAR_THRESHOLD_PERCENT = 65;
