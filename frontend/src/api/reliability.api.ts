import { apiClient } from "./client";
import type {
  ProjectReliabilityRow,
  RecurringIncidentGroup,
  ReliabilityFilterParams,
  ReliabilityInsight,
  ReliabilityOverview,
  ReliabilityTrends,
} from "../types/reliability.types";

// Phase 33 "Enterprise Reliability Intelligence & Incident Learning" - reine
// Lese-Endpunkte, Filter (organizationId/range/projectId/severity) werden
// 1:1 als Query-Parameter an das Backend durchgereicht (routes/reliability.routes.ts).
export async function fetchReliabilityOverview(params: ReliabilityFilterParams): Promise<ReliabilityOverview> {
  const { data } = await apiClient.get<ReliabilityOverview>("/api/reliability/overview", { params });
  return data;
}

export async function fetchReliabilityTrends(params: ReliabilityFilterParams): Promise<ReliabilityTrends> {
  const { data } = await apiClient.get<ReliabilityTrends>("/api/reliability/trends", { params });
  return data;
}

export async function fetchReliabilityProjects(params: ReliabilityFilterParams): Promise<ProjectReliabilityRow[]> {
  const { data } = await apiClient.get<ProjectReliabilityRow[]>("/api/reliability/projects", { params });
  return data;
}

export async function fetchRecurringIncidents(params: ReliabilityFilterParams): Promise<RecurringIncidentGroup[]> {
  const { data } = await apiClient.get<RecurringIncidentGroup[]>("/api/reliability/recurring-incidents", { params });
  return data;
}

export async function fetchReliabilityInsights(params: ReliabilityFilterParams): Promise<ReliabilityInsight[]> {
  const { data } = await apiClient.get<ReliabilityInsight[]>("/api/reliability/insights", { params });
  return data;
}
