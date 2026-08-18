import { apiClient } from "./client";
import type { AutomationExecution, AutomationExecutionStatus, AutomationLog, AutomationLogLevel } from "../types/automation.types";
import type { AutomationExecutionOutcome } from "../types/automation-outcome.types";

export interface FetchAutomationExecutionsFilters {
  projectId?: string;
  status?: AutomationExecutionStatus;
  limit?: number;
}

export async function fetchAutomationExecutions(filters: FetchAutomationExecutionsFilters = {}): Promise<AutomationExecution[]> {
  const { data } = await apiClient.get<AutomationExecution[]>("/api/automation-executions", { params: filters });
  return data;
}

export async function fetchAutomationExecution(id: string): Promise<AutomationExecution> {
  const { data } = await apiClient.get<AutomationExecution>(`/api/automation-executions/${id}`);
  return data;
}

export async function fetchExecutionLogs(executionId: string, level?: AutomationLogLevel): Promise<AutomationLog[]> {
  const { data } = await apiClient.get<AutomationLog[]>(`/api/automation-executions/${executionId}/logs`, {
    params: level ? { level } : undefined,
  });
  return data;
}

// Phase 51 "Enterprise Decision Execution & Closed-Loop Operations".
export async function fetchExecutionOutcome(executionId: string): Promise<AutomationExecutionOutcome> {
  const { data } = await apiClient.get<AutomationExecutionOutcome>(`/api/automation-executions/${executionId}/outcome`);
  return data;
}
