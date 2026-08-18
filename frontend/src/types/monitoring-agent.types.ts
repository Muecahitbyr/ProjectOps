// Spiegelt src/types/monitoring-agent.types.ts im Backend.
export type MonitoringAgentStatus = "ONLINE" | "DEGRADED" | "OFFLINE";

// Phase 14 - administrativer Lebenszyklus, unabhaengig vom Liveness-Status
// oben (siehe Backend-Kommentar).
export type AgentLifecycleStatus = "ACTIVE" | "PAUSED" | "REVOKED";

export interface MonitoringAgent {
  id: string;
  name: string;
  region: string | null;
  hostname: string;
  agentVersion: string;
  schedulerVersion: string;
  capabilities: string[];
  cpuInfo: string | null;
  ramMb: number | null;
  diskTotalMb: number | null;
  os: string;
  dockerVersion: string | null;
  lastHeartbeatAt: string;
  status: MonitoringAgentStatus;
  createdAt: string;
  checkCountLast24h: number;
  tags: string[];
  tlsFingerprint: string | null;
  nodeVersion: string | null;
  lifecycleStatus: AgentLifecycleStatus;
  hasSecret: boolean;
  secretRotatedAt: string | null;
}
