import type { CheckStatus } from "./common.types";

export interface TimelinePoint {
  timestamp: string;
  checkId: string;
  status: CheckStatus;
  responseTimeMs: number | null;
}

export interface TimelineResult {
  total: number;
  limit: number;
  offset: number;
  hasNext: boolean;
  hasPrevious: boolean;
  items: TimelinePoint[];
}
