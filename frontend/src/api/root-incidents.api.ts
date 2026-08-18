import { apiClient } from "./client";
import type { RootIncident } from "../types/root-incident.types";

export async function fetchRootIncidents(limit = 50): Promise<RootIncident[]> {
  const { data } = await apiClient.get<RootIncident[]>("/api/root-incidents", { params: { limit } });
  return data;
}
