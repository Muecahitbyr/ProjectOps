export type ClusterEventType =
  | "AGENT_REGISTERED"
  | "AGENT_UPDATED"
  | "AGENT_REMOVED"
  | "AGENT_PAUSED"
  | "AGENT_RESUMED"
  | "CHECK_REASSIGNED"
  | "FAILOVER_STARTED"
  | "FAILOVER_FINISHED"
  | "CLUSTER_UPDATED"
  | "ROLLING_UPDATE_STARTED"
  | "ROLLING_UPDATE_FINISHED";

export interface ClusterEvent {
  id: number;
  eventType: ClusterEventType;
  agentId: string | null;
  message: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface CreateClusterEventInput {
  eventType: ClusterEventType;
  agentId?: string;
  message: string;
  metadata?: Record<string, unknown>;
}

// Auftragspunkt 5 "Failover Historie" - ein FAILOVER_STARTED/FINISHED-Paar
// (per metadata.failoverId verknuepft) ergibt die Recovery-Zeit.
export interface FailoverHistoryEntry {
  failoverId: string;
  failedAgentId: string;
  failedAgentName: string;
  reassignedCheckCount: number;
  startedAt: string;
  finishedAt: string | null;
  recoveryTimeMs: number | null;
}
