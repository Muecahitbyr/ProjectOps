// Phase 14 "High Availability" (Auftragspunkt 11) - ein cluster_nodes-
// Eintrag entspricht einer ProjectOps-Backend-Instanz. In dieser
// Architektur existiert echt genau EIN Prozess -> genau ein PRIMARY-Knoten,
// keine erfundenen SECONDARY-Knoten. Weitere echte Instanzen koennen sich
// ueber denselben Mechanismus melden (core/cluster-node.ts), werden hier
// aber nicht vorgetaeuscht.
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

// "Election Status"/"Split Brain Detection" sind laut Auftrag bewusst nur
// Architektur ("Keine echte Leader Election notwendig") - bei genau einem
// Knoten ist er trivial und ehrlich der Leader; bei mehreren erkannten
// PRIMARY-Knoten gleichzeitig wird splitBrainSuspected=true gemeldet statt
// stillschweigend einen davon zu bevorzugen.
export interface ClusterHaState {
  nodes: ClusterNode[];
  leaderId: string | null;
  electionStatus: "STABLE" | "NO_LEADER" | "SPLIT_BRAIN_SUSPECTED";
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
