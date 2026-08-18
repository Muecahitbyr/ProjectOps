import { useQuery } from "@tanstack/react-query";
import {
  fetchReliabilityInsights,
  fetchReliabilityOverview,
  fetchReliabilityProjects,
  fetchReliabilityTrends,
  fetchRecurringIncidents,
} from "../api/reliability.api";
import { queryKeys } from "./queryKeys";
import type { ReliabilityFilterParams } from "../types/reliability.types";

// Phase 33 "Enterprise Reliability Intelligence & Incident Learning" -
// bewusst OHNE eigenes refetchInterval (wie useChangeRisk/useIncidentCommand-
// Overview): die zugrunde liegenden Signale (Incidents/Postmortems/Changes/
// Automation-Ausfuehrungen) haben bereits eigene Realtime-Events, auf die
// hooks/useRealtime.ts mit einer Praefix-Invalidierung von ["reliability"]
// reagiert (siehe dort) - kein zusaetzliches Polling noetig.
export function useReliabilityOverview(params: ReliabilityFilterParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.reliabilityOverview(params),
    queryFn: () => fetchReliabilityOverview(params),
    enabled,
  });
}

export function useReliabilityTrends(params: ReliabilityFilterParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.reliabilityTrends(params),
    queryFn: () => fetchReliabilityTrends(params),
    enabled,
  });
}

// Phase 34 "Enterprise SLO, SLA & Error-Budget Intelligence" - im
// Unterschied zu den uebrigen Hooks oben MIT einem leichten refetchInterval
// (wie hooks/useSlo.ts#useSlos, SLO_REFRESH_MS=30s): diese Abfrage zeigt
// seit dieser Phase zusaetzlich eine SLO-Zusammenfassung je Projekt
// (sloCount/worstSloStatus/avgErrorBudgetRemainingPercent). Reines SLO-CRUD
// (anlegen/bearbeiten/loeschen) loest bewusst KEIN Realtime-Event aus (siehe
// core/slo-evaluator.ts - nur echte Status-Uebergaenge broadcasten), daher
// wuerde ein zweiter, bereits offener /reliability-Tab eine neu angelegte
// SLO sonst bis zum naechsten Status-Uebergang nicht sehen. Kein neues
// Event eingefuehrt (Auftrag verlangt das nur "falls wirklich notwendig") -
// ein kurzes Polling reicht fuer diesen einen, vergleichsweise seltenen
// Aktualisierungsfall.
const RELIABILITY_PROJECTS_REFRESH_MS = 30_000;

export function useReliabilityProjects(params: ReliabilityFilterParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.reliabilityProjects(params),
    queryFn: () => fetchReliabilityProjects(params),
    refetchInterval: RELIABILITY_PROJECTS_REFRESH_MS,
    enabled,
  });
}

export function useRecurringIncidents(params: ReliabilityFilterParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.reliabilityRecurringIncidents(params),
    queryFn: () => fetchRecurringIncidents(params),
    enabled,
  });
}

export function useReliabilityInsights(params: ReliabilityFilterParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.reliabilityInsights(params),
    queryFn: () => fetchReliabilityInsights(params),
    enabled,
  });
}
