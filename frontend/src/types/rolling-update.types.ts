export type RollingUpdateStatus = "PENDING" | "DOWNLOADING" | "INSTALLING" | "RESTARTING" | "HEALTHY" | "FAILED" | "ROLLED_BACK";

export interface RollingUpdate {
  id: string;
  agentId: string;
  targetVersion: string;
  status: RollingUpdateStatus;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  createdBy: string | null;
  createdAt: string;
}

export const ROLLING_UPDATE_TRANSITIONS: Record<RollingUpdateStatus, RollingUpdateStatus[]> = {
  PENDING: ["DOWNLOADING", "FAILED"],
  DOWNLOADING: ["INSTALLING", "FAILED"],
  INSTALLING: ["RESTARTING", "FAILED"],
  RESTARTING: ["HEALTHY", "FAILED"],
  HEALTHY: [],
  FAILED: ["ROLLED_BACK"],
  ROLLED_BACK: [],
};
