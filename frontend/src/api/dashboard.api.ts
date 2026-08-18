import { apiClient } from "./client";
import type { DashboardSummary } from "../types/dashboard.types";
import type { DashboardEvent } from "../types/event.types";
import type { TimelineResult } from "../types/timeline.types";

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  const { data } = await apiClient.get<DashboardSummary>("/api/dashboard");
  return data;
}

export async function fetchDashboardEvents(limit = 50): Promise<DashboardEvent[]> {
  const { data } = await apiClient.get<DashboardEvent[]>("/api/dashboard/events", {
    params: { limit },
  });
  return data;
}

export interface TimelineParams {
  projectId?: string;
  hours?: number;
  limit?: number;
  offset?: number;
}

export async function fetchTimeline(params: TimelineParams = {}): Promise<TimelineResult> {
  const { data } = await apiClient.get<TimelineResult>("/api/dashboard/timeline", { params });
  return data;
}
