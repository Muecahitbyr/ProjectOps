import type { CheckStatus, HealthStatus, IncidentSeverity } from "../types/common.types";

// Zentrale Farb-/Label-Zuordnung fuer alle Status-Darstellungen im Dashboard.
// Vermeidet verstreute Farb-Strings in einzelnen Komponenten.
export const healthStatusColors: Record<HealthStatus, string> = {
  healthy: "#22c55e",
  warning: "#f59e0b",
  critical: "#ef4444",
};

export const healthStatusLabels: Record<HealthStatus, string> = {
  healthy: "Healthy",
  warning: "Warning",
  critical: "Critical",
};

// CheckStatus kennt vier Werte (inkl. OFFLINE), wird fuer die Anzeige aber
// auf dieselben drei Signalfarben abgebildet - OFFLINE zaehlt visuell wie
// ERROR (beides kritisch).
export function checkStatusToHealthStatus(status: CheckStatus): HealthStatus {
  if (status === "ONLINE") return "healthy";
  if (status === "WARNING") return "warning";
  return "critical";
}

export function checkStatusColor(status: CheckStatus): string {
  return healthStatusColors[checkStatusToHealthStatus(status)];
}

export const severityColors: Record<IncidentSeverity, string> = {
  LOW: "#60a5fa",
  MEDIUM: "#f59e0b",
  HIGH: "#f97316",
  CRITICAL: "#ef4444",
};

export const severityLabels: Record<IncidentSeverity, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};
