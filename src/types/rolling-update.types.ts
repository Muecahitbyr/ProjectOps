// Phase 14 Teil 9 "Rolling Updates" - bewusst NUR Architektur/
// Statusverwaltung, kein echter Software-Download (siehe Auftrag).
export type RollingUpdateStatus = "PENDING" | "DOWNLOADING" | "INSTALLING" | "RESTARTING" | "HEALTHY" | "FAILED" | "ROLLED_BACK";

export interface RollingUpdate {
  id: number;
  agentId: string;
  targetVersion: string;
  status: RollingUpdateStatus;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface CreateRollingUpdateInput {
  agentId: string;
  targetVersion: string;
  createdBy?: string;
}

// Erlaubte Uebergaenge der Statusmaschine - verhindert ungueltige Spruenge
// (z.B. direkt PENDING -> HEALTHY) sowohl im Backend als auch als
// Dokumentation fuer das Frontend.
export const ROLLING_UPDATE_TRANSITIONS: Record<RollingUpdateStatus, RollingUpdateStatus[]> = {
  PENDING: ["DOWNLOADING", "FAILED"],
  DOWNLOADING: ["INSTALLING", "FAILED"],
  INSTALLING: ["RESTARTING", "FAILED"],
  RESTARTING: ["HEALTHY", "FAILED"],
  HEALTHY: [],
  FAILED: ["ROLLED_BACK"],
  ROLLED_BACK: [],
};
