// Phase 46 "Enterprise Capacity Early-Warning & Trend Intelligence" -
// Bestandsanalyse: buildResilienceOverview() (Phase 37, gecacht seit Phase
// 41) und buildServiceResilienceDetail() (Phase 42/46, inkl. der drei
// PROJECTED_*-Forecast-Signale) bleiben die EINZIGEN Berechnungsstellen -
// dieses Modul ist reine Selektions-/Aggregationsschicht darueber, exakt
// wie core/operational-priority.ts (Phase 43) fuer die Priority Queue.
// Unterschied zur Priority Queue (bewusst NICHT dort mit hineingemischt):
// die Priority Queue filtert auf bereits NICHT-gesunde Projekte (aktueller
// Zustand). Diese Watchlist filtert NICHT auf den aktuellen Status - ein
// aktuell HEALTHY Projekt mit einem klar degradierenden Forecast-Trend soll
// hier sichtbar werden, BEVOR es tatsaechlich kippt (das ist die
// eigentliche neue Enterprise-Faehigkeit dieser Phase, siehe
// Abschlussbericht).
import { buildResilienceOverview, buildServiceResilienceDetail } from "./service-resilience";
import { pickPrimarySignal, SIGNAL_SEVERITY_RANK, SPOF_PRIORITY_WEIGHT, BLAST_RADIUS_PRIORITY_CAP } from "./operational-priority";
import type { ResilienceOverviewRow, ResilienceSignalType } from "../types/resilience.types";
import type { CapacityWatchlist, CapacityWatchlistEntry } from "../types/capacity-intelligence.types";

export interface CapacityWatchlistFilter {
  organizationId: string;
  hours: number;
  limit?: number;
}

// Dieselbe nachsichtige limit-Klemmung (kein hartes Zod .max(), siehe
// routes/resilience.routes.ts-Kommentar zu Phase 43) statt eines
// harten Ablehnens ausserhalb des Bereichs.
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const CAPACITY_SIGNAL_TYPES = new Set<ResilienceSignalType>(["PROJECTED_DEGRADATION", "PROJECTED_INCIDENT_INCREASE", "PROJECTED_RESPONSE_TIME_DEGRADATION"]);

// Auftragspunkt 22 "N+1 bewusst begrenzen" (dasselbe Muster wie Phase 43's
// computePriorityScore()): eine guenstige Vorsortierung ALLER Kandidaten
// (nicht nur nicht-gesunder, siehe Dateikopf) ueber bereits in
// ResilienceOverviewRow vorhandene Felder, BEVOR die teure
// Forecast-/Detail-Abfrage nur fuer die vielversprechendsten Top-N Projekte
// laeuft. Die Gewichtung bevorzugt Projekte, die bereits IRGENDEIN
// Stress-Signal zeigen (wiederkehrende Incidents, Fehlerbudget-Risiko,
// SLO-Status, lange MTTR) - diese haben in der Praxis die hoechste
// Wahrscheinlichkeit, auch tatsaechlich einen degradierenden Forecast-Trend
// zu haben. Dieselbe additive, dokumentierte Gewichtungslogik wie
// computePriorityScore() (Phase 43) - kein Blackbox-Scoring.
function computeCandidateScore(row: ResilienceOverviewRow): number {
  return (
    row.recurringIncidentCount * 10 +
    row.incidentCount +
    (row.errorBudgetRisk ? 20 : 0) +
    (row.worstSloStatus === "CRITICAL" ? 15 : row.worstSloStatus === "DEGRADED" ? 8 : 0) +
    Math.min(row.mttrMs !== null ? row.mttrMs / 60_000 : 0, 10)
  );
}

export async function buildCapacityWatchlist(filter: CapacityWatchlistFilter): Promise<CapacityWatchlist> {
  const limit = Math.min(Math.max(filter.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const overview = await buildResilienceOverview({ organizationId: filter.organizationId, hours: filter.hours });

  // Nur Projekte MIT Messdaten koennen ueberhaupt einen Forecast haben
  // (UNKNOWN = kein verknuepfter Service/keine Check-Ergebnisse) - fuer sie
  // eine Detailabfrage auszufuehren waere eine garantiert verschwendete
  // Query (sufficientData waere immer false).
  const candidates = overview.rows.filter((row) => row.healthStatus !== "UNKNOWN");
  const ranked = candidates
    .map((row) => ({ row, score: computeCandidateScore(row) }))
    .sort((a, b) => b.score - a.score || a.row.projectId.localeCompare(b.row.projectId))
    .slice(0, limit);

  const details = await Promise.all(ranked.map((r) => buildServiceResilienceDetail(r.row.projectId, filter.hours)));

  const entries: CapacityWatchlistEntry[] = [];
  ranked.forEach((r, index) => {
    const detail = details[index];
    if (!detail) return;
    const capacitySignals = detail.signals.filter((signal) => CAPACITY_SIGNAL_TYPES.has(signal.type));
    if (capacitySignals.length === 0) return;
    entries.push({
      projectId: r.row.projectId,
      projectName: r.row.projectName,
      serviceId: r.row.serviceId,
      serviceName: r.row.serviceName,
      resilienceStatus: r.row.resilienceStatus,
      capacitySignals,
      // Bereits auf ResilienceOverviewRow vorhanden (Phase 37) - keine
      // zweite Blast-Radius-/SPOF-/Dependents-Berechnung.
      blastRadius: r.row.blastRadius,
      isPotentialSpof: r.row.isPotentialSpof,
      dependentCount: r.row.dependentCount,
      // Phase 54 "Enterprise Predictive Operations & Risk Prevention" -
      // dieselbe additive, bereits etablierte Gewichtung wie
      // computePriorityScore() (Phase 43, jetzt exportiert) fuer AKTIVE
      // Probleme - bisher trug diese Watchlist Blast-Radius/SPOF nur zur
      // ANZEIGE mit (siehe types/capacity-intelligence.types.ts-Kommentar),
      // ohne sie in die Rangfolge einfliessen zu lassen. Transparent
      // mitgeliefert (kein Blackbox-Score), siehe Sortierung unten.
      dependencyRiskScore: (r.row.isPotentialSpof ? SPOF_PRIORITY_WEIGHT : 0) + Math.min(r.row.blastRadius, BLAST_RADIUS_PRIORITY_CAP),
    });
  });

  // Signal-Schweregrad bleibt dominant (ein CRITICAL-Forecast-Signal steht
  // immer vor einem WARNING, unabhaengig von Abhaengigkeiten) - Abhaengigkeits-
  // Risiko entscheidet erst INNERHALB derselben Schweregradstufe, wo bisher
  // nur die rohe Signal-ANZAHL zaehlte (kein sinnvoller Rangfolge-Faktor).
  entries.sort((a, b) => {
    const aPrimary = pickPrimarySignal(a.capacitySignals);
    const bPrimary = pickPrimarySignal(b.capacitySignals);
    const aRank = aPrimary ? SIGNAL_SEVERITY_RANK[aPrimary.severity] : -1;
    const bRank = bPrimary ? SIGNAL_SEVERITY_RANK[bPrimary.severity] : -1;
    return (
      bRank - aRank ||
      b.dependencyRiskScore - a.dependencyRiskScore ||
      b.capacitySignals.length - a.capacitySignals.length ||
      a.projectId.localeCompare(b.projectId)
    );
  });

  return {
    organizationId: filter.organizationId,
    windowHours: filter.hours,
    generatedAt: new Date().toISOString(),
    candidatesEvaluated: ranked.length,
    entries,
  };
}
