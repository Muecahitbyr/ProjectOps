import { useQuery } from "@tanstack/react-query";
import {
  fetchAnalyticsSummary,
  fetchDrillDown,
  fetchIncidentAnalytics,
  fetchProjectComparison,
  fetchProjectHistory,
  fetchProjectSla,
  fetchResponseTimeAnalytics,
  type DrillDownParams,
  type RangeParams,
  type ResponseTimeParams,
  type SummaryParams,
} from "../api/analytics.api";
import { queryKeys } from "./queryKeys";

// Kein refetchInterval (kein Polling, siehe Auftrag) - Analytics-Queries
// werden ausschliesslich ueber useRealtime.ts per WebSocket-Event
// invalidiert (Praefix ["analytics"]).

export function useAnalyticsSummary(params: SummaryParams = {}) {
  return useQuery({
    queryKey: queryKeys.analyticsSummary(params),
    queryFn: () => fetchAnalyticsSummary(params),
  });
}

export function useProjectHistory(projectId: string, params: RangeParams) {
  return useQuery({
    queryKey: queryKeys.analyticsHistory(projectId, params),
    queryFn: () => fetchProjectHistory(projectId, params),
    enabled: projectId.length > 0 && (params.range !== "custom" || (!!params.from && !!params.to)),
  });
}

export function useProjectSla(projectId: string, hours: number) {
  return useQuery({
    queryKey: queryKeys.analyticsSla(projectId, hours),
    queryFn: () => fetchProjectSla(projectId, hours),
    enabled: projectId.length > 0,
  });
}

export function useIncidentAnalytics(params: SummaryParams = {}, enabled = true) {
  return useQuery({
    queryKey: queryKeys.analyticsIncidents(params),
    queryFn: () => fetchIncidentAnalytics(params),
    enabled,
  });
}

export function useResponseTimeAnalytics(params: ResponseTimeParams) {
  return useQuery({
    queryKey: queryKeys.analyticsResponseTime(params),
    queryFn: () => fetchResponseTimeAnalytics(params),
    enabled: params.range !== "custom" || (!!params.from && !!params.to),
  });
}

export function useProjectComparison(projectAId: string, projectBId: string, hours: number) {
  return useQuery({
    queryKey: queryKeys.analyticsCompare(projectAId, projectBId, hours),
    queryFn: () => fetchProjectComparison(projectAId, projectBId, hours),
    enabled: projectAId.length > 0 && projectBId.length > 0 && projectAId !== projectBId,
  });
}

export function useDrillDown(params: DrillDownParams) {
  return useQuery({
    queryKey: queryKeys.analyticsDrilldown(params),
    queryFn: () => fetchDrillDown(params),
  });
}
