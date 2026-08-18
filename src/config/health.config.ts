import type { CheckStatus } from "../types/check-result.types";

// Zentrale Konfiguration fuer die Health-Score-Berechnung
// (src/db/dashboard.repository.ts). Keine Magic Numbers mehr im Code -
// Anpassungen an der Gewichtung erfolgen ausschliesslich hier.
export const healthScoreConfig = {
  minScore: 0,
  maxScore: 100,
  warningPenalty: 10,
  errorPenalty: 25,
  offlinePenalty: 40,
} as const;

// Definiert projektweit, welche Check-Status als "erfolgreich" gelten (u.a.
// fuer die Verfuegbarkeitsberechnung, ONLINE/WARNING = erfolgreich,
// ERROR/OFFLINE = Fehler). Zentral gepflegt statt als wiederholte
// String-Literale in mehreren SQL-Abfragen.
export const SUCCESSFUL_CHECK_STATUSES: readonly CheckStatus[] = ["ONLINE", "WARNING"];
