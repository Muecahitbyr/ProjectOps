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
  id: string;
  eventType: ClusterEventType;
  agentId: string | null;
  message: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}
