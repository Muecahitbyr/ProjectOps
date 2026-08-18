import { apiClient } from "./client";
import type { AlertEscalationStep, AlertRule, CreateAlertRuleInput, CreateEscalationStepInput, UpdateAlertRuleInput } from "../types/alert.types";

export async function fetchAlertRules(projectId?: string): Promise<AlertRule[]> {
  const { data } = await apiClient.get<AlertRule[]>("/api/alerts", {
    params: projectId ? { projectId } : undefined,
  });
  return data;
}

export async function fetchAlertRule(id: string): Promise<AlertRule> {
  const { data } = await apiClient.get<AlertRule>(`/api/alerts/${id}`);
  return data;
}

export async function createAlertRule(input: CreateAlertRuleInput): Promise<AlertRule> {
  const { data } = await apiClient.post<AlertRule>("/api/alerts", input);
  return data;
}

export async function updateAlertRule(id: string, input: UpdateAlertRuleInput): Promise<AlertRule> {
  const { data } = await apiClient.patch<AlertRule>(`/api/alerts/${id}`, input);
  return data;
}

export async function deleteAlertRule(id: string): Promise<void> {
  await apiClient.delete(`/api/alerts/${id}`);
}

export async function fetchEscalationSteps(alertRuleId: string): Promise<AlertEscalationStep[]> {
  const { data } = await apiClient.get<AlertEscalationStep[]>(`/api/alerts/${alertRuleId}/escalation`);
  return data;
}

export async function replaceEscalationSteps(alertRuleId: string, steps: CreateEscalationStepInput[]): Promise<AlertEscalationStep[]> {
  const { data } = await apiClient.put<AlertEscalationStep[]>(`/api/alerts/${alertRuleId}/escalation`, { steps });
  return data;
}
