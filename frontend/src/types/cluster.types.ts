// Spiegelt src/types/cluster.types.ts im Backend.
export type ClusterNodeRole = "PRIMARY" | "SECONDARY";
export type ClusterNodeStatus = "HEALTHY" | "DEGRADED" | "UNREACHABLE";

export interface ClusterNode {
  id: string;
  role: ClusterNodeRole;
  hostname: string;
  backendVersion: string;
  status: ClusterNodeStatus;
  lastHeartbeatAt: string;
  createdAt: string;
}

export type ClusterElectionStatus = "STABLE" | "NO_LEADER" | "SPLIT_BRAIN_SUSPECTED";

export interface ClusterHaState {
  nodes: ClusterNode[];
  leaderId: string | null;
  electionStatus: ClusterElectionStatus;
  splitBrainSuspected: boolean;
}

export type DistributionStrategy = "ROUND_ROBIN" | "WEIGHTED" | "LEAST_LOADED" | "REGION_PREFERRED" | "HEALTH_PREFERRED";

export interface AgentAssignment {
  checkId: string;
  agentId: string;
  strategy: DistributionStrategy;
  assignedAt: string;
}

export interface ClusterHealthReport {
  generatedAt: string;
  totalAgents: number;
  onlineAgents: number;
  offlineAgents: number;
  degradedAgents: number;
  totalChecks: number;
  assignedChecks: number;
  unassignedChecks: number;
  strategy: DistributionStrategy;
  ha: ClusterHaState;
}

export interface AgentDistributionEntry {
  agentId: string;
  agentName: string;
  region: string | null;
  assignedCheckCount: number;
}

export interface ClusterOverview {
  generatedAt: string;
  agentCount: number;
  onlineAgentCount: number;
  strategy: DistributionStrategy;
  ha: ClusterHaState;
}

export interface ClusterAnalytics {
  generatedAt: string;
  distribution: AgentDistributionEntry[];
  failoverHistory: FailoverHistoryEntry[];
  agentCount: number;
  strategy: DistributionStrategy;
}

export interface FailoverHistoryEntry {
  failoverId: string;
  failedAgentId: string;
  failedAgentName: string;
  reassignedCheckCount: number;
  startedAt: string;
  finishedAt: string | null;
  recoveryTimeMs: number | null;
}
