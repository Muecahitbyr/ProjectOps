import { apiClient } from "./client";
import type { DiagnosticsSnapshot, DisasterRecoveryReport } from "../types/diagnostics.types";

export async function fetchDiagnosticsSnapshot(): Promise<DiagnosticsSnapshot> {
  const { data } = await apiClient.get<DiagnosticsSnapshot>("/api/diagnostics");
  return data;
}

export async function fetchDisasterRecoveryReport(): Promise<DisasterRecoveryReport> {
  const { data } = await apiClient.get<DisasterRecoveryReport>("/api/disaster-recovery");
  return data;
}
