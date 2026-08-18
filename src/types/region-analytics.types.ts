// Phase 13 Teil 2 "Geografische Monitoring-Standorte" - Analytics-Kennzahlen
// pro Region. Regionen kommen ausschliesslich aus monitoring_agents.region
// (konfigurierbar per AGENT_REGION env var, siehe core/local-agent.ts) -
// keine hartkodierten/erfundenen Standorte. Agenten ohne konfigurierte
// Region werden ehrlich unter "unconfigured" zusammengefasst statt
// ausgeblendet zu werden.
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
