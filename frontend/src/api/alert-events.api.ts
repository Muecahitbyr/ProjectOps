import { apiClient } from "./client";
import type { AlertEventListResult, AlertEventQuery } from "../types/alert.types";

export async function fetchAlertEvents(query: AlertEventQuery = {}): Promise<AlertEventListResult> {
  const { data } = await apiClient.get<AlertEventListResult>("/api/alert-events", { params: query });
  return data;
}
