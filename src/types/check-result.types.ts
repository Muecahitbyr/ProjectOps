import type { CheckType } from "./project.types";

export type CheckStatus = "ONLINE" | "WARNING" | "OFFLINE" | "ERROR";

export interface CheckResult {
  checkId: string;
  projectId: string;
  type: CheckType;
  status: CheckStatus;
  statusCode?: number;
  responseTimeMs?: number;
  error?: string;
  metadata?: Record<string, unknown>;
  checkedAt: string;
}
