import { apiClient } from "./client";
import type {
  AnalyticsRange,
  AnalyticsSummary,
  DrillDownFilters,
  DrillDownResult,
  IncidentAnalytics,
  ProjectComparison,
  ProjectHistory,
  ProjectSla,
  ResponseTimeAnalytics,
} from "../types/analytics.types";

export interface SummaryParams {
  projectId?: string;
  hours?: number;
}

export async function fetchAnalyticsSummary(params: SummaryParams = {}): Promise<AnalyticsSummary> {
  const { data } = await apiClient.get<AnalyticsSummary>("/api/analytics/summary", { params });
  return data;
}

export interface RangeParams {
  range: AnalyticsRange;
  from?: string;
  to?: string;
}

export async function fetchProjectHistory(projectId: string, params: RangeParams): Promise<ProjectHistory> {
  const { data } = await apiClient.get<ProjectHistory>(`/api/analytics/projects/${projectId}/history`, { params });
  return data;
}

export async function fetchProjectSla(projectId: string, hours: number): Promise<ProjectSla> {
  const { data } = await apiClient.get<ProjectSla>(`/api/analytics/projects/${projectId}/sla`, { params: { hours } });
  return data;
}

export async function fetchIncidentAnalytics(params: SummaryParams = {}): Promise<IncidentAnalytics> {
  const { data } = await apiClient.get<IncidentAnalytics>("/api/analytics/incidents", { params });
  return data;
}

export interface ResponseTimeParams extends RangeParams {
  projectId?: string;
  checkId?: string;
}

export async function fetchResponseTimeAnalytics(params: ResponseTimeParams): Promise<ResponseTimeAnalytics> {
  const { data } = await apiClient.get<ResponseTimeAnalytics>("/api/analytics/response-time", { params });
  return data;
}

export async function fetchProjectComparison(projectAId: string, projectBId: string, hours: number): Promise<ProjectComparison> {
  const { data } = await apiClient.get<ProjectComparison>("/api/analytics/compare", {
    params: { projectAId, projectBId, hours },
  });
  return data;
}

export interface DrillDownParams extends DrillDownFilters {
  page?: number;
  pageSize?: number;
}

export async function fetchDrillDown(params: DrillDownParams = {}): Promise<DrillDownResult> {
  const { data } = await apiClient.get<DrillDownResult>("/api/analytics/drilldown", { params });
  return data;
}
