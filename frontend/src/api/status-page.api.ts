import { apiClient } from "./client";
import type { PublicStatusHistory, PublicStatusPage } from "../types/status-page.types";

// Oeffentlicher Endpunkt (kein withCredentials-Cookie noetig, siehe
// backend routes/status-page.routes.ts) - nutzt trotzdem denselben
// apiClient wie alle anderen Module fuer konsistentes baseURL-Handling.
export async function fetchPublicStatusPage(): Promise<PublicStatusPage> {
  const { data } = await apiClient.get<PublicStatusPage>("/api/status-page");
  return data;
}

export async function fetchPublicStatusHistory(projectId: string, days: number): Promise<PublicStatusHistory> {
  const { data } = await apiClient.get<PublicStatusHistory>(`/api/status-page/${projectId}/history`, { params: { days } });
  return data;
}
