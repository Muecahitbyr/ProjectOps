// Spiegelt src/types/region-analytics.types.ts im Backend.
export interface RegionAnalyticsEntry {
  region: string;
  agentCount: number;
  checkCount: number;
  avgResponseTimeMs: number | null;
  failureRatePercent: number;
}

export interface AgentPerformanceEntry {
  agentId: string;
  agentName: string;
  region: string | null;
  checkCount: number;
  avgResponseTimeMs: number | null;
  failureRatePercent: number;
}

export interface AgentHeartbeatBucket {
  bucketStart: string;
  heartbeatCount: number;
}

export interface MaintenanceImpactEntry {
  maintenanceWindowId: number;
  projectId: string;
  reason: string;
  startsAt: string;
  endsAt: string;
  issuesObservedDuringWindow: number;
}
