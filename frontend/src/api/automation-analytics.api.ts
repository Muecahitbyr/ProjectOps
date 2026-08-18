import { apiClient } from "./client";
import type { AutomationAnalytics } from "../types/automation.types";

export async function fetchAutomationAnalytics(projectId?: string): Promise<AutomationAnalytics> {
  const { data } = await apiClient.get<AutomationAnalytics>("/api/automation-analytics", {
    params: projectId ? { projectId } : undefined,
  });
  return data;
}
