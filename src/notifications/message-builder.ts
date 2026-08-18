import type { ProjectConfig } from "../types/project.types";
import type { CheckResult } from "../types/check-result.types";
import type { IncidentAnalysis } from "../ai/analysis.types";
import type { NotificationPayload } from "./notification.types";

export function buildNotificationPayload(
  project: ProjectConfig,
  result: CheckResult,
  analysis: IncidentAnalysis,
): NotificationPayload {
  return {
    projectId: project.id,
    projectName: project.name,
    checkId: result.checkId,
    error: result.error ?? "Unbekannter Fehler",
    timestamp: result.checkedAt,
    analysis,
    ...(result.responseTimeMs !== undefined ? { responseTimeMs: result.responseTimeMs } : {}),
  };
}
