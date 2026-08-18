import { apiClient } from "./client";
import type { Incident, IncidentTimelineEvent } from "../types/incident.types";

export interface IncidentsQuery {
  resolved?: boolean;
  limit?: number;
  // Phase 23 "Enterprise Service Catalog, Dependency Mapping & Topology
  // Intelligence" Auftragspunkt 14 "Service Detail" - optionaler Filter
  // fuer den "Incidents"-Tab der Service-Detailseite.
  projectId?: string;
}

export async function fetchIncidents(query: IncidentsQuery = {}): Promise<Incident[]> {
  const { data } = await apiClient.get<Incident[]>("/api/incidents", {
    params: query,
  });
  return data;
}

// Phase 21 "Enterprise Alerting, Incident Response & Notification
// Orchestration" Auftragspunkt 11/13 "Incident API"/"Incident Detail Page".
export async function fetchIncident(id: string): Promise<Incident> {
  const { data } = await apiClient.get<Incident>(`/api/incidents/${id}`);
  return data;
}

export async function fetchIncidentTimeline(id: string): Promise<IncidentTimelineEvent[]> {
  const { data } = await apiClient.get<IncidentTimelineEvent[]>(`/api/incidents/${id}/timeline`);
  return data;
}

export async function acknowledgeIncident(id: string): Promise<Incident> {
  const { data } = await apiClient.post<Incident>(`/api/incidents/${id}/acknowledge`);
  return data;
}

export async function resolveIncident(id: string, reason?: string): Promise<Incident> {
  const { data } = await apiClient.post<Incident>(`/api/incidents/${id}/resolve`, reason ? { reason } : {});
  return data;
}

export async function reopenIncident(id: string): Promise<Incident> {
  const { data } = await apiClient.post<Incident>(`/api/incidents/${id}/reopen`);
  return data;
}

export async function assignIncident(id: string, assigneeId: string | null): Promise<Incident> {
  const { data } = await apiClient.post<Incident>(`/api/incidents/${id}/assign`, { assigneeId });
  return data;
}

export async function commentOnIncident(id: string, message: string): Promise<IncidentTimelineEvent> {
  const { data } = await apiClient.post<IncidentTimelineEvent>(`/api/incidents/${id}/comment`, { message });
  return data;
}
