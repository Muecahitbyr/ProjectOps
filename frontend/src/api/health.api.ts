import { apiClient } from "./client";
import type { BackendHealth } from "../types/backend-health.types";

// GET /health liegt bewusst nicht unter /api - siehe Backend health.routes.ts.
export async function fetchBackendHealth(): Promise<BackendHealth> {
  const { data } = await apiClient.get<BackendHealth>("/health");
  return data;
}
