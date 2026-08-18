import { apiClient } from "./client";
import type { RecoveryActionsResponse, RecoveryExecuteResponse } from "../types/recovery.types";

export async function fetchRecoveryActions(incidentId: string): Promise<RecoveryActionsResponse> {
  const { data } = await apiClient.get<RecoveryActionsResponse>(`/api/incidents/${incidentId}/recovery-actions`);
  return data;
}

export async function executeRecoveryAction(incidentId: string, ruleId: string): Promise<RecoveryExecuteResponse> {
  const { data } = await apiClient.post<RecoveryExecuteResponse>(`/api/incidents/${incidentId}/recovery-actions/${ruleId}/execute`, {});
  return data;
}
