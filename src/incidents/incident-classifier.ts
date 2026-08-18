import type { CheckConfig, CheckType, ProjectConfig } from "../types/project.types";
import type { CheckResult, CheckStatus } from "../types/check-result.types";
import type { IncidentSeverity } from "../types/incident.types";

// Kern-Abhaengigkeiten, deren Ausfall die App direkt funktionsunfaehig macht.
const CORE_DEPENDENCY_TYPES: CheckType[] = ["firebase-status", "firestore", "stripe", "api-health"];

export function severityForCheck(checkType: CheckType, status: CheckStatus): IncidentSeverity {
  if (CORE_DEPENDENCY_TYPES.includes(checkType)) {
    return "CRITICAL";
  }
  if (status === "OFFLINE" || checkType === "dns") {
    return "HIGH";
  }
  if (checkType === "ssl") {
    return "MEDIUM";
  }
  return "LOW";
}

export function buildIncidentTitle(project: ProjectConfig, check: CheckConfig, result: CheckResult): string {
  const reason = result.status === "OFFLINE" ? "nicht erreichbar" : "fehlgeschlagen";
  return `${project.name}: ${check.type} ${reason}`;
}
