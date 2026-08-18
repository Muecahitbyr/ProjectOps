// Phase 13 Teil 1 "Monitoring Agents". status wird nicht gespeichert,
// sondern aus last_heartbeat_at zur Laufzeit abgeleitet (siehe
// db/monitoring-agents.repository.ts) - vermeidet einen veraltet
// gespeicherten Zustand.
export type MonitoringAgentStatus = "ONLINE" | "DEGRADED" | "OFFLINE";

// Phase 14 - administrativer Lebenszyklus (Auftragspunkt 3 "Agent
// Discovery": pausieren/reaktivieren/entfernen), UNABHAENGIG vom oben
// abgeleiteten Liveness-Status. Ein pausierter Agent kann z.B. weiterhin
// "ONLINE" (aktiv verbunden) sein, nimmt aber bewusst an keiner neuen
// Check-Zuweisung teil (siehe core/distributed-scheduler.ts).
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
  // Phase 14 - Felder fuer echte Remote-Agenten (Auftragspunkt 1/2).
  tags: string[];
  tlsFingerprint: string | null;
  nodeVersion: string | null;
  lifecycleStatus: AgentLifecycleStatus;
  hasSecret: boolean;
  secretRotatedAt: string | null;
}
