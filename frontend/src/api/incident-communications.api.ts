import { apiClient } from "./client";
import type { CreateIncidentCommunicationInput, IncidentCommunication, IncidentCommunicationsResponse } from "../types/incident-communication.types";

export async function fetchIncidentCommunications(incidentId: string): Promise<IncidentCommunicationsResponse> {
  const { data } = await apiClient.get<IncidentCommunicationsResponse>(`/api/incidents/${incidentId}/communications`);
  return data;
}

export async function createIncidentCommunication(incidentId: string, input: CreateIncidentCommunicationInput): Promise<IncidentCommunication> {
  const { data } = await apiClient.post<IncidentCommunication>(`/api/incidents/${incidentId}/communications`, input);
  return data;
}
