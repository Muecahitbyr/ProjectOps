import type { ClusterHealthReport } from "../types/cluster.types";
import type { MonitoringAgent } from "../types/monitoring-agent.types";
import type { RollingUpdate } from "../types/rolling-update.types";
import type { FailoverHistoryEntry } from "../types/cluster.types";
import type { ObservabilityCityBuildingData } from "../types/observability-city.types";

export interface ClusterCityInput {
  health: ClusterHealthReport | undefined;
  agents: MonitoringAgent[];
  rollingUpdates: RollingUpdate[];
  failoverHistory: FailoverHistoryEntry[];
  isSchedulerActive: boolean;
  isFailoverActive: boolean;
}

// Reine Transformationsfunktion (analog zu automationCityMapper.ts /
// observabilityCityMapper.ts, Phase 11/13) - nimmt bereits geladene Daten
// entgegen, keine eigenen API-Aufrufe. Phase 14 Teil 12 "Mini City
// Erweiterung" (Cluster District).
export function mapClusterToCity(input: ClusterCityInput): ObservabilityCityBuildingData[] {
  const { health, agents, rollingUpdates, failoverHistory, isSchedulerActive, isFailoverActive } = input;

  const primaryNode: ObservabilityCityBuildingData = {
    id: "cluster-primary-node",
    name: "Primary Node",
    type: "primary-node",
    status: !health ? "idle" : health.ha.electionStatus === "STABLE" ? "healthy" : "alert",
    metrics: [
      { label: "Election status", value: health?.ha.electionStatus ?? "unknown" },
      { label: "Nodes", value: String(health?.ha.nodes.length ?? 0) },
    ],
  };

  const remoteAgents = agents.filter((agent) => agent.hasSecret);
  const remoteAgentsHub: ObservabilityCityBuildingData = {
    id: "cluster-remote-agents",
    name: "Remote Agents",
    type: "remote-agents-hub",
    status: remoteAgents.length === 0 ? "idle" : remoteAgents.some((agent) => agent.status === "OFFLINE") ? "alert" : "healthy",
    metrics: [
      { label: "Registered", value: String(remoteAgents.length) },
      { label: "Online", value: String(remoteAgents.filter((agent) => agent.status === "ONLINE").length) },
    ],
  };

  const scheduler: ObservabilityCityBuildingData = {
    id: "cluster-scheduler",
    name: "Scheduler",
    type: "scheduler",
    status: isSchedulerActive ? "active" : !health ? "idle" : health.unassignedChecks > 0 ? "alert" : "healthy",
    metrics: [
      { label: "Assigned checks", value: `${health?.assignedChecks ?? 0}/${health?.totalChecks ?? 0}` },
      { label: "Strategy", value: health?.strategy ?? "unknown" },
    ],
  };

  const clusterController: ObservabilityCityBuildingData = {
    id: "cluster-controller",
    name: "Cluster Controller",
    type: "cluster-controller",
    status: !health ? "idle" : health.offlineAgents > 0 ? "alert" : health.degradedAgents > 0 ? "active" : "healthy",
    metrics: [
      { label: "Online agents", value: String(health?.onlineAgents ?? 0) },
      { label: "Offline agents", value: String(health?.offlineAgents ?? 0) },
    ],
  };

  const activeUpdate = rollingUpdates.find((update) => update.status === "DOWNLOADING" || update.status === "INSTALLING" || update.status === "RESTARTING");
  const failedUpdate = rollingUpdates.find((update) => update.status === "FAILED");
  const updateCenter: ObservabilityCityBuildingData = {
    id: "cluster-update-center",
    name: "Update Center",
    type: "update-center",
    status: activeUpdate ? "active" : rollingUpdates.length === 0 ? "idle" : failedUpdate ? "alert" : "healthy",
    metrics: [
      { label: "Total updates", value: String(rollingUpdates.length) },
      { label: "In progress", value: activeUpdate ? "1" : "0" },
    ],
  };

  const unresolvedFailover = failoverHistory.some((entry) => entry.finishedAt === null);
  const failoverCenter: ObservabilityCityBuildingData = {
    id: "cluster-failover-center",
    name: "Failover Center",
    type: "failover-center",
    status: isFailoverActive || unresolvedFailover ? "active" : failoverHistory.length === 0 ? "idle" : "healthy",
    metrics: [
      { label: "Total failovers", value: String(failoverHistory.length) },
      { label: "Last recovery", value: failoverHistory[0]?.recoveryTimeMs ? `${Math.round(failoverHistory[0].recoveryTimeMs / 1000)}s` : "n/a" },
    ],
  };

  return [primaryNode, remoteAgentsHub, scheduler, clusterController, updateCenter, failoverCenter];
}
