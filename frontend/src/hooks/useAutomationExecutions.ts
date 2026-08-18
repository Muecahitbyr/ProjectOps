import { useQuery } from "@tanstack/react-query";
import {
  fetchAutomationExecution,
  fetchAutomationExecutions,
  fetchExecutionLogs,
  fetchExecutionOutcome,
  type FetchAutomationExecutionsFilters,
} from "../api/automation-executions.api";
import { queryKeys } from "./queryKeys";
import type { AutomationLogLevel } from "../types/automation.types";

export function useAutomationExecutions(filters: FetchAutomationExecutionsFilters = {}) {
  return useQuery({
    queryKey: queryKeys.automationExecutions(filters.projectId, filters.status),
    queryFn: () => fetchAutomationExecutions(filters),
  });
}

export function useAutomationExecution(id: string) {
  return useQuery({
    queryKey: queryKeys.automationExecution(id),
    queryFn: () => fetchAutomationExecution(id),
    enabled: id.length > 0,
  });
}

export function useExecutionLogs(executionId: string, level?: AutomationLogLevel) {
  return useQuery({
    queryKey: queryKeys.automationExecutionLogs(executionId, level),
    queryFn: () => fetchExecutionLogs(executionId, level),
    enabled: executionId.length > 0,
  });
}

// Phase 51 "Enterprise Decision Execution & Closed-Loop Operations".
export function useExecutionOutcome(executionId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.automationExecutionOutcome(executionId),
    queryFn: () => fetchExecutionOutcome(executionId),
    enabled: enabled && executionId.length > 0,
  });
}
