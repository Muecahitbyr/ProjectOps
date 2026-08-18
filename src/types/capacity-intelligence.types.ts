// Phase 46 "Enterprise Capacity Early-Warning & Trend Intelligence" -
// Bestandsanalyse-Ergebnis: die Priority Queue (Phase 43,
// types/resilience.types.ts#PriorityQueue) zeigt AUSSCHLIESSLICH bereits
// nicht-gesunde Projekte - ein aktuell HEALTHY Projekt mit einem klar
// degradierenden Forecast-Trend (core/service-resilience.ts, Phase 42/46)
// bleibt dort komplett unsichtbar, bis es tatsaechlich kippt. Diese Datei
// ergaenzt AUSSCHLIESSLICH die dafuer noetigen Watchlist-Typen - keine neue
// Rohsignalquelle (alle Felder stammen 1:1 aus ResilienceOverviewRow/
// ServiceResilienceDetail, siehe resilience.types.ts), keine neue
// Statustabelle.
import type { ResilienceSignal, ResilienceStatus } from "./resilience.types";

export interface CapacityWatchlistEntry {
  projectId: string;
  projectName: string;
  serviceId: number | null;
  serviceName: string | null;
  // Bewusst der AKTUELLE Status (kann HEALTHY sein - das ist der ganze Punkt
  // dieser Watchlist im Unterschied zur Priority Queue, siehe Dateikopf).
  resilienceStatus: ResilienceStatus;
  // Alle gefundenen, rein prospektiven PROJECTED_*-Signale dieses Projekts
  // (siehe core/service-resilience.ts) - unveraendert uebernommen, keine
  // zweite Interpretation.
  capacitySignals: ResilienceSignal[];
  // Abhaengigkeits-/Blast-Radius-Kontext (Phase 25/37) - bereits Teil von
  // ServiceResilienceDetail, hier nur mit uebernommen, damit "welche
  // abhaengigen Services waeren betroffen" ohne einen zweiten Request
  // sichtbar ist (Auftragspunkt 8/11 "Abhaengigkeit beruecksichtigen").
  blastRadius: number;
  isPotentialSpof: boolean;
  dependentCount: number;
  // Phase 54 "Enterprise Predictive Operations & Risk Prevention" -
  // dieselbe SPOF-/Blast-Radius-Gewichtung wie Priority Queue's
  // priorityScore (Phase 43), jetzt auch fuer die Rangfolge dieser bisher
  // rein signalbasierten Watchlist verwendet (core/capacity-intelligence.ts).
  dependencyRiskScore: number;
}

export interface CapacityWatchlist {
  organizationId: string;
  windowHours: number;
  generatedAt: string;
  // Wie viele Projekte ueberhaupt fuer eine Forecast-Detailpruefung in Frage
  // kamen (nach dem guenstigen Vorfilter, vor dem Limit) - macht
  // nachvollziehbar, ob eine leere Liste "alles stabil" oder "zu wenig
  // Kandidaten geprueft" bedeutet.
  candidatesEvaluated: number;
  entries: CapacityWatchlistEntry[];
}
