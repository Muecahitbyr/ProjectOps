import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchResilienceOverview,
  fetchServiceResilienceDetail,
  fetchServiceResilienceDependencies,
  fetchServiceResilienceSignals,
  fetchPriorityQueue,
  fetchPriorityItemAcknowledgment,
  acknowledgePriorityItem,
  fetchAcknowledgmentOutcomeHistory,
  fetchOutcomeIntelligenceSummary,
  fetchCapacityWatchlist,
  fetchBusinessImpactOverview,
  fetchForecastAccuracySummary,
  fetchDecisionContext,
  fetchOperationalState,
  fetchAttentionList,
} from "../api/resilience.api";
import type { AttentionListParams } from "../api/resilience.api";
import { queryKeys } from "./queryKeys";
import type { ResilienceOverviewParams } from "../types/resilience.types";

// Phase 37 "Enterprise Service Resilience & Dependency Intelligence" -
// bewusst OHNE eigenes refetchInterval (wie useReliabilityOverview): die
// zugrunde liegenden Signale (Incidents/Changes/SLOs/Probleme/Topologie)
// haben bereits eigene Realtime-Events, auf die hooks/useRealtime.ts mit
// einer Praefix-Invalidierung von ["resilience"] reagiert (siehe dort).
export function useResilienceOverview(params: ResilienceOverviewParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.resilienceOverview(params),
    queryFn: () => fetchResilienceOverview(params),
    enabled,
  });
}

export function useServiceResilienceDetail(projectId: string, range: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.resilienceService(projectId, range),
    queryFn: () => fetchServiceResilienceDetail(projectId, range),
    enabled: enabled && projectId.length > 0,
  });
}

export function useServiceResilienceDependencies(projectId: string, range: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.resilienceServiceDependencies(projectId, range),
    queryFn: () => fetchServiceResilienceDependencies(projectId, range),
    enabled: enabled && projectId.length > 0,
  });
}

export function useServiceResilienceSignals(projectId: string, range: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.resilienceServiceSignals(projectId, range),
    queryFn: () => fetchServiceResilienceSignals(projectId, range),
    enabled: enabled && projectId.length > 0,
  });
}

// Phase 43 "Enterprise Operational Priority Intelligence" - dieselbe
// Realtime-Invalidierungsstrategie wie useResilienceOverview oben (Praefix
// ["resilience"] deckt auch diesen neuen Query-Key mit ab, siehe
// hooks/queryKeys.ts).
export function usePriorityQueue(params: ResilienceOverviewParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.resiliencePriorityQueue(params),
    queryFn: () => fetchPriorityQueue(params),
    enabled,
  });
}

// Phase 44 "Enterprise Priority Queue Acknowledgment Governance".
export function usePriorityItemAcknowledgment(projectId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.resilienceAcknowledgment(projectId),
    queryFn: () => fetchPriorityItemAcknowledgment(projectId),
    enabled: enabled && projectId.length > 0,
  });
}

export function useAcknowledgePriorityItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, range, note }: { projectId: string; range: string; note?: string }) => acknowledgePriorityItem(projectId, range, note),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.resilienceAcknowledgment(variables.projectId) });
      // Praefix-Invalidierung deckt sowohl die Priority Queue (43) als auch
      // die Detailseite (37) ab, dieselbe Konvention wie ueberall sonst in
      // diesem System.
      void queryClient.invalidateQueries({ queryKey: ["resilience"] });
    },
  });
}

// Phase 45 "Enterprise Acknowledgment Outcome & Continuous Improvement
// Intelligence" - dieselbe Praefix-Invalidierungsstrategie wie oben (rein
// lesend, keine eigene Mutation noetig).
export function useAcknowledgmentOutcomeHistory(projectId: string, range: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.resilienceAcknowledgmentHistory(projectId, range),
    queryFn: () => fetchAcknowledgmentOutcomeHistory(projectId, range),
    enabled: enabled && projectId.length > 0,
  });
}

export function useOutcomeIntelligenceSummary(params: ResilienceOverviewParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.resilienceOutcomes(params),
    queryFn: () => fetchOutcomeIntelligenceSummary(params),
    enabled,
  });
}

// Phase 46 "Enterprise Capacity Early-Warning & Trend Intelligence".
export function useCapacityWatchlist(params: ResilienceOverviewParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.resilienceCapacityWatchlist(params),
    queryFn: () => fetchCapacityWatchlist(params),
    enabled,
  });
}

// Phase 47 "Enterprise Business Impact & Service Criticality Intelligence".
export function useBusinessImpactOverview(params: ResilienceOverviewParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.resilienceBusinessImpact(params),
    queryFn: () => fetchBusinessImpactOverview(params),
    enabled,
  });
}

// Phase 49 "Enterprise Risk Forecasting & Proactive Operations Intelligence".
export function useForecastAccuracySummary(params: ResilienceOverviewParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.resilienceProactiveRiskAccuracy(params),
    queryFn: () => fetchForecastAccuracySummary(params),
    enabled,
  });
}

// Phase 50 "Enterprise Operational Decision & Executive Intelligence".
export function useDecisionContext(projectId: string, range: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.resilienceDecisionContext(projectId, range),
    queryFn: () => fetchDecisionContext(projectId, range),
    enabled: enabled && projectId.length > 0,
  });
}

// Phase 63 "Enterprise Operational Portfolio Intelligence" - dieselbe
// Realtime-Invalidierungsstrategie wie useResilienceOverview oben (Praefix
// ["resilience"] deckt diesen neuen Query-Key mit ab).
export function useOperationalState(params: ResilienceOverviewParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.resilienceOperationalState(params),
    queryFn: () => fetchOperationalState(params),
    enabled,
  });
}

// Phase 64 "Enterprise Operational Priority & Attention Management" -
// ebenfalls unter dem "resilience"-Praefix.
export function useAttentionList(params: AttentionListParams, enabled = true) {
  return useQuery({
    queryKey: queryKeys.resilienceAttentionList(params),
    queryFn: () => fetchAttentionList(params),
    enabled,
  });
}
