import { useQuery } from "@tanstack/react-query";
import { fetchProjectDetail, fetchProjectsHealth } from "../api/projects.api";
import { queryKeys } from "./queryKeys";
import { REFRESH_INTERVAL_PROJECTS_MS } from "../utils/constants";

export function useProjectsHealth() {
  return useQuery({
    queryKey: queryKeys.projectsHealth,
    queryFn: fetchProjectsHealth,
    refetchInterval: REFRESH_INTERVAL_PROJECTS_MS,
  });
}

export function useProjectDetail(projectId: string) {
  return useQuery({
    queryKey: queryKeys.projectDetail(projectId),
    queryFn: () => fetchProjectDetail(projectId),
    refetchInterval: REFRESH_INTERVAL_PROJECTS_MS,
    enabled: projectId.length > 0,
  });
}
