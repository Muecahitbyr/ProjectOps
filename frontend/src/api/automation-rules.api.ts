import { apiClient } from "./client";
import type { AutomationRule, CreateAutomationRuleInput, UpdateAutomationRuleInput } from "../types/automation.types";

export async function fetchAutomationRules(projectId?: string): Promise<AutomationRule[]> {
  const { data } = await apiClient.get<AutomationRule[]>("/api/automation-rules", {
    params: projectId ? { projectId } : undefined,
  });
  return data;
}

export async function createAutomationRule(input: CreateAutomationRuleInput): Promise<AutomationRule> {
  const { data } = await apiClient.post<AutomationRule>("/api/automation-rules", input);
  return data;
}

export async function updateAutomationRule(id: string, input: UpdateAutomationRuleInput): Promise<AutomationRule> {
  const { data } = await apiClient.patch<AutomationRule>(`/api/automation-rules/${id}`, input);
  return data;
}

export async function deleteAutomationRule(id: string): Promise<void> {
  await apiClient.delete(`/api/automation-rules/${id}`);
}
