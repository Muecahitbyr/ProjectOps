import { apiClient } from "./client";
import type { SlaReport } from "../types/sla-report.types";

export async function fetchSlaReport(projectId: string, hours: number): Promise<SlaReport> {
  const { data } = await apiClient.get<SlaReport>(`/api/sla-report/${projectId}`, { params: { hours } });
  return data;
}
