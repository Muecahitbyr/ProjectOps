import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { fetchDashboardSummary } from "../api/dashboard.api";
import { fetchProjectDetail, fetchProjectsHealth } from "../api/projects.api";
import { queryKeys } from "./queryKeys";
import { mapDashboardToCity } from "../utils/cityMapper";
import { REFRESH_INTERVAL_DASHBOARD_MS, REFRESH_INTERVAL_PROJECTS_MS } from "../utils/constants";
import type { CityBuilding } from "../types/city.types";
import type { ProjectDashboardDetail } from "../types/project.types";

export interface UseCityResult {
  buildings: CityBuilding[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

// Orchestriert die bestehenden Dashboard-API-Aufrufe fuer die City-Ansicht:
// Projektliste + Detail je Projekt (fuer die Infrastruktur-Aggregation in
// cityMapper.ts) + Gesamt-Summary, parallel geladen. Keine eigene
// Datenhaltung und keine neue Datenquelle - reine Orchestrierung.
export function useCity(): UseCityResult {
  const summaryQuery = useQuery({
    queryKey: queryKeys.dashboardSummary,
    queryFn: fetchDashboardSummary,
    refetchInterval: REFRESH_INTERVAL_DASHBOARD_MS,
  });

  const projectsQuery = useQuery({
    queryKey: queryKeys.projectsHealth,
    queryFn: fetchProjectsHealth,
    refetchInterval: REFRESH_INTERVAL_PROJECTS_MS,
  });

  const projectIds = useMemo(
    () => (projectsQuery.data ?? []).map((project) => project.id),
    [projectsQuery.data],
  );

  // Dieselben Query-Keys/Fetcher wie useProjectDetail() - Besuche der
  // Projekt-Detailseite und der City-Seite teilen sich den React-Query-Cache.
  const detailQueries = useQueries({
    queries: projectIds.map((id) => ({
      queryKey: queryKeys.projectDetail(id),
      queryFn: () => fetchProjectDetail(id),
      refetchInterval: REFRESH_INTERVAL_PROJECTS_MS,
    })),
  });

  const details = detailQueries
    .map((query) => query.data)
    .filter((detail): detail is ProjectDashboardDetail => detail !== undefined);
  const detailsReady = projectIds.length === 0 || details.length === projectIds.length;

  const isLoading = summaryQuery.isLoading || projectsQuery.isLoading || !detailsReady;
  const isError = summaryQuery.isError || projectsQuery.isError || detailQueries.some((query) => query.isError);

  // Kein useMemo hier: die Eingaben (details) sind ohnehin bei jedem Render
  // ein neues Array, ein Memo wuerde also trotzdem jedes Mal neu rechnen -
  // die Transformation selbst ist fuer eine Handvoll Gebaeude trivial billig.
  const buildings =
    summaryQuery.data && projectsQuery.data && detailsReady
      ? mapDashboardToCity(projectsQuery.data, details, summaryQuery.data)
      : [];

  const refetch = (): void => {
    void summaryQuery.refetch();
    void projectsQuery.refetch();
    detailQueries.forEach((query) => void query.refetch());
  };

  return { buildings, isLoading, isError, refetch };
}
