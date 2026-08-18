import { useQuery } from "@tanstack/react-query";
import { fetchAutomationAnalytics } from "../api/automation-analytics.api";
import { queryKeys } from "./queryKeys";

export function useAutomationAnalytics(projectId?: string) {
  return useQuery({
    queryKey: queryKeys.automationAnalytics(projectId),
    queryFn: () => fetchAutomationAnalytics(projectId),
  });
}
