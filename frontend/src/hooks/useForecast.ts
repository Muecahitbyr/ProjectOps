import { useQuery } from "@tanstack/react-query";
import { fetchForecast } from "../api/forecast.api";
import { queryKeys } from "./queryKeys";
import type { ForecastMetric } from "../types/forecast.types";

export function useForecast(metric: ForecastMetric, scopeId?: string) {
  return useQuery({
    queryKey: queryKeys.forecast(metric, scopeId),
    queryFn: () => fetchForecast(metric, scopeId),
  });
}
