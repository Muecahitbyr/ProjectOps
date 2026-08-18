import { apiClient } from "./client";
import type { ForecastMetric, ForecastResult } from "../types/forecast.types";

export async function fetchForecast(metric: ForecastMetric, scopeId?: string): Promise<ForecastResult> {
  const isAgentMetric = metric === "DISK_USAGE" || metric === "CAPACITY";
  const { data } = await apiClient.get<ForecastResult>(`/api/forecasts/${metric}`, {
    params: scopeId ? (isAgentMetric ? { agentId: scopeId } : { projectId: scopeId }) : undefined,
  });
  return data;
}
