import { useQuery } from "@tanstack/react-query";
import { fetchSlaReport } from "../api/sla-report.api";
import { queryKeys } from "./queryKeys";

export function useSlaReport(projectId: string | undefined, hours: number) {
  return useQuery({
    queryKey: queryKeys.slaReport(projectId ?? "", hours),
    queryFn: () => fetchSlaReport(projectId!, hours),
    enabled: Boolean(projectId),
  });
}
