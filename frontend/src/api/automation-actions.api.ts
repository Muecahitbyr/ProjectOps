import { apiClient } from "./client";
import type { AutomationAction, AutomationActionStatus, AutomationExecution } from "../types/automation.types";

export async function fetchAutomationActions(projectId?: string, status?: AutomationActionStatus): Promise<AutomationAction[]> {
  const { data } = await apiClient.get<AutomationAction[]>("/api/automation-actions", {
    params: { ...(projectId ? { projectId } : {}), ...(status ? { status } : {}) },
  });
  return data;
}

export async function updateAutomationActionStatus(id: string, status: AutomationActionStatus): Promise<AutomationAction> {
  const { data } = await apiClient.patch<AutomationAction>(`/api/automation-actions/${id}`, { status });
  return data;
}

export async function fetchExecutionsForAction(actionId: string): Promise<AutomationExecution[]> {
  const { data } = await apiClient.get<AutomationExecution[]>(`/api/automation-actions/${actionId}/executions`);
  return data;
}

export async function executeAutomationAction(id: string, dryRun = false): Promise<AutomationExecution> {
  const { data } = await apiClient.post<AutomationExecution>(`/api/automation-actions/${id}/execute`, { dryRun });
  return data;
}
