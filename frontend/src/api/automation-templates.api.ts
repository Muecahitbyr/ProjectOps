import { apiClient } from "./client";
import type { AutomationRule, AutomationTemplate } from "../types/automation.types";

export async function fetchAutomationTemplates(): Promise<AutomationTemplate[]> {
  const { data } = await apiClient.get<AutomationTemplate[]>("/api/automation-templates");
  return data;
}

export async function applyAutomationTemplate(templateId: string, projectId: string): Promise<AutomationRule> {
  const { data } = await apiClient.post<AutomationRule>(`/api/automation-templates/${templateId}/apply`, { projectId });
  return data;
}
