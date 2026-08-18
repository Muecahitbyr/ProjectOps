import { useQuery } from "@tanstack/react-query";
import { fetchDashboardEvents, fetchDashboardSummary, fetchTimeline, type TimelineParams } from "../api/dashboard.api";
import { queryKeys } from "./queryKeys";
import {
  DEFAULT_EVENTS_LIMIT,
  REFRESH_INTERVAL_DASHBOARD_MS,
  REFRESH_INTERVAL_EVENTS_MS,
  REFRESH_INTERVAL_TIMELINE_MS,
} from "../utils/constants";

export function useDashboardSummary() {
  return useQuery({
    queryKey: queryKeys.dashboardSummary,
    queryFn: fetchDashboardSummary,
    refetchInterval: REFRESH_INTERVAL_DASHBOARD_MS,
  });
}

export function useDashboardEvents(limit = DEFAULT_EVENTS_LIMIT) {
  return useQuery({
    queryKey: queryKeys.dashboardEvents(limit),
    queryFn: () => fetchDashboardEvents(limit),
    refetchInterval: REFRESH_INTERVAL_EVENTS_MS,
  });
}

export function useTimeline(params: TimelineParams = {}) {
  return useQuery({
    queryKey: queryKeys.timeline(params),
    queryFn: () => fetchTimeline(params),
    refetchInterval: REFRESH_INTERVAL_TIMELINE_MS,
  });
}
