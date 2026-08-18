import { apiClient } from "./client";
import type { ChecklistItem, ChecklistItemKey, ChecklistItemStatus, CommandOverview, IncidentCommandRole, IncidentCommandRoleType, IncidentCommandState } from "../types/incident-command.types";

export async function fetchCommandState(incidentId: string): Promise<IncidentCommandState> {
  const { data } = await apiClient.get<IncidentCommandState>(`/api/incidents/${incidentId}/command`);
  return data;
}

export async function fetchCommandOverview(incidentId: string): Promise<CommandOverview> {
  const { data } = await apiClient.get<CommandOverview>(`/api/incidents/${incidentId}/command/overview`);
  return data;
}

export async function assignCommandRole(incidentId: string, role: IncidentCommandRoleType, userId: string): Promise<IncidentCommandRole> {
  const { data } = await apiClient.put<IncidentCommandRole>(`/api/incidents/${incidentId}/command/roles`, { role, userId });
  return data;
}

export async function unassignCommandRole(incidentId: string, role: IncidentCommandRoleType): Promise<void> {
  await apiClient.delete(`/api/incidents/${incidentId}/command/roles/${role}`);
}

export async function updateChecklistItem(incidentId: string, itemKey: ChecklistItemKey, status: ChecklistItemStatus): Promise<ChecklistItem> {
  const { data } = await apiClient.put<ChecklistItem>(`/api/incidents/${incidentId}/command/checklist/${itemKey}`, { status });
  return data;
}
