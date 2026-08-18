import { apiClient } from "./client";
import type { Change, ChangeCategory, ChangeRisk, ChangeStatus, ChangeType, ChangeWithServices } from "../types/change.types";
import type { Incident } from "../types/incident.types";
import type { MaintenanceWindow } from "../types/maintenance.types";
import type { Service, ImpactResult } from "../types/service.types";
import type { AuditLogEntry } from "../types/audit.types";
import type { Deployment } from "../types/deployment.types";
import type { ChangeRiskAnalysis } from "../types/change-risk.types";

export interface ChangesQuery {
  organizationId: string;
  status?: ChangeStatus;
  risk?: ChangeRisk;
  changeType?: ChangeType;
  category?: ChangeCategory;
  serviceId?: number;
  from?: string;
  to?: string;
}

export async function fetchChanges(query: ChangesQuery): Promise<ChangeWithServices[]> {
  const { data } = await apiClient.get<ChangeWithServices[]>("/api/changes", { params: query });
  return data;
}

export interface ChangeDetail extends ChangeWithServices {
  deployment: Deployment | null;
}

export async function fetchChange(id: number): Promise<ChangeDetail> {
  const { data } = await apiClient.get<ChangeDetail>(`/api/changes/${id}`);
  return data;
}

export interface CreateChangeInput {
  organizationId: string;
  title: string;
  description?: string;
  changeType?: ChangeType;
  category?: ChangeCategory;
  risk?: ChangeRisk;
  riskAssessment?: string;
  rollbackPlan?: string;
  ownerId?: string;
  plannedStartAt?: string;
  plannedEndAt?: string;
  emergencyJustification?: string;
  serviceIds?: number[];
  deploymentId?: number;
}

export async function createChange(input: CreateChangeInput): Promise<ChangeWithServices> {
  const { data } = await apiClient.post<ChangeWithServices>("/api/changes", input);
  return data;
}

export interface UpdateChangeInput {
  title?: string;
  description?: string | null;
  changeType?: ChangeType;
  category?: ChangeCategory;
  risk?: ChangeRisk;
  riskAssessment?: string | null;
  rollbackPlan?: string | null;
  ownerId?: string | null;
  plannedStartAt?: string | null;
  plannedEndAt?: string | null;
  emergencyJustification?: string | null;
  serviceIds?: number[];
  deploymentId?: number | null;
}

export async function updateChange(id: number, input: UpdateChangeInput): Promise<ChangeWithServices> {
  const { data } = await apiClient.patch<ChangeWithServices>(`/api/changes/${id}`, input);
  return data;
}

export async function deleteChange(id: number): Promise<void> {
  await apiClient.delete(`/api/changes/${id}`);
}

export async function scheduleChange(id: number): Promise<Change> {
  const { data } = await apiClient.post<Change>(`/api/changes/${id}/schedule`);
  return data;
}
export async function startChange(id: number): Promise<Change> {
  const { data } = await apiClient.post<Change>(`/api/changes/${id}/start`);
  return data;
}
export async function completeChange(id: number): Promise<Change> {
  const { data } = await apiClient.post<Change>(`/api/changes/${id}/complete`);
  return data;
}
export async function cancelChange(id: number, reason?: string): Promise<Change> {
  const { data } = await apiClient.post<Change>(`/api/changes/${id}/cancel`, reason ? { reason } : {});
  return data;
}
export async function failChange(id: number, reason?: string): Promise<Change> {
  const { data } = await apiClient.post<Change>(`/api/changes/${id}/fail`, reason ? { reason } : {});
  return data;
}
export async function approveChange(id: number): Promise<Change> {
  const { data } = await apiClient.post<Change>(`/api/changes/${id}/approve`);
  return data;
}
export async function rejectChange(id: number, reason: string): Promise<Change> {
  const { data } = await apiClient.post<Change>(`/api/changes/${id}/reject`, { reason });
  return data;
}

export async function replaceChangeServices(id: number, serviceIds: number[]): Promise<{ changeId: number; serviceIds: number[] }> {
  const { data } = await apiClient.put(`/api/changes/${id}/services`, { serviceIds });
  return data;
}

export interface ChangeImpactResponse {
  services: { service: Service; impact: ImpactResult }[];
}
export async function fetchChangeImpact(id: number): Promise<ChangeImpactResponse> {
  const { data } = await apiClient.get<ChangeImpactResponse>(`/api/changes/${id}/impact`);
  return data;
}

export async function fetchChangeRelatedIncidents(id: number): Promise<Incident[]> {
  const { data } = await apiClient.get<Incident[]>(`/api/changes/${id}/related-incidents`);
  return data;
}

export async function fetchChangeMaintenanceWindows(id: number): Promise<MaintenanceWindow[]> {
  const { data } = await apiClient.get<MaintenanceWindow[]>(`/api/changes/${id}/maintenance-windows`);
  return data;
}

export async function fetchChangesForService(serviceId: number): Promise<Change[]> {
  const { data } = await apiClient.get<Change[]>(`/api/services/${serviceId}/changes`);
  return data;
}

export interface IncidentChangeContext {
  maintenanceWindow: MaintenanceWindow | null;
  relatedChanges: Change[];
}
export async function fetchIncidentChangeContext(incidentId: string): Promise<IncidentChangeContext> {
  const { data } = await apiClient.get<IncidentChangeContext>(`/api/incidents/${incidentId}/change-context`);
  return data;
}

export async function fetchChangeAudit(id: number): Promise<AuditLogEntry[]> {
  const { data } = await apiClient.get<AuditLogEntry[]>(`/api/changes/${id}/audit`);
  return data;
}

// Phase 29 "Enterprise Change Intelligence, Risk Correlation & Deployment
// Safety" - "correlationReason" ergaenzt (same-service | upstream-
// dependency, siehe routes/incidents.routes.ts).
export interface CorrelatedChange extends Change {
  correlationReason: "same-service" | "upstream-dependency";
}
export interface RecentChangesResponse {
  windowMinutes: number;
  changes: CorrelatedChange[];
}
export async function fetchRecentChangesForIncident(incidentId: string, windowMinutes?: number): Promise<RecentChangesResponse> {
  const { data } = await apiClient.get<RecentChangesResponse>(`/api/incidents/${incidentId}/recent-changes`, {
    params: windowMinutes ? { windowMinutes } : {},
  });
  return data;
}

export async function fetchChangeRisk(id: number): Promise<ChangeRiskAnalysis> {
  const { data } = await apiClient.get<ChangeRiskAnalysis>(`/api/changes/${id}/risk`);
  return data;
}
