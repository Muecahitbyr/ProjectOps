import { apiClient } from "./client";
import type { EscalationPolicyWithSteps, EscalationTargetType, IncidentEscalationStatus } from "../types/escalation-policy.types";

export async function fetchEscalationPolicies(organizationId: string): Promise<EscalationPolicyWithSteps[]> {
  const { data } = await apiClient.get<EscalationPolicyWithSteps[]>("/api/escalation-policies", { params: { organizationId } });
  return data;
}

export async function fetchEscalationPolicy(id: number): Promise<EscalationPolicyWithSteps> {
  const { data } = await apiClient.get<EscalationPolicyWithSteps>(`/api/escalation-policies/${id}`);
  return data;
}

export interface CreateEscalationPolicyInput {
  organizationId: string;
  name: string;
  description?: string;
  enabled?: boolean;
}

export async function createEscalationPolicy(input: CreateEscalationPolicyInput): Promise<EscalationPolicyWithSteps> {
  const { data } = await apiClient.post<EscalationPolicyWithSteps>("/api/escalation-policies", input);
  return data;
}

export interface UpdateEscalationPolicyInput {
  name?: string;
  description?: string | null;
  enabled?: boolean;
}

export async function updateEscalationPolicy(id: number, input: UpdateEscalationPolicyInput): Promise<EscalationPolicyWithSteps> {
  const { data } = await apiClient.patch<EscalationPolicyWithSteps>(`/api/escalation-policies/${id}`, input);
  return data;
}

export async function deleteEscalationPolicy(id: number): Promise<void> {
  await apiClient.delete(`/api/escalation-policies/${id}`);
}

export interface EscalationStepInput {
  stepOrder: number;
  delayMinutes: number;
  targetType: EscalationTargetType;
  targetUserId?: string;
  targetScheduleId?: number;
}

export async function replaceEscalationPolicySteps(id: number, steps: EscalationStepInput[]): Promise<EscalationPolicyWithSteps> {
  const { data } = await apiClient.put<EscalationPolicyWithSteps>(`/api/escalation-policies/${id}/steps`, { steps });
  return data;
}

export async function fetchIncidentEscalationStatus(incidentId: string): Promise<IncidentEscalationStatus> {
  const { data } = await apiClient.get<IncidentEscalationStatus>(`/api/incidents/${incidentId}/escalation`);
  return data;
}
