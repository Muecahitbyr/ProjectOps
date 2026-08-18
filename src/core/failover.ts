import { randomUUID } from "node:crypto";
import { listMonitoringAgents } from "../db/monitoring-agents.repository";
import { reassignChecksFromAgent } from "../db/agent-assignments.repository";
import { createClusterEvent } from "../db/cluster-events.repository";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";
import { recordAgentLog } from "./agent-log";
import { dispatchWebhookEvent } from "./webhook-dispatch";
import { logger } from "./logger";
import type { DistributionStrategy } from "../types/cluster.types";

// Phase 14 Teil 5 "Agent Failover" - erkennt echte, ueber
// last_heartbeat_at abgeleitete OFFLINE-Agenten (siehe monitoring-agents.
// repository.ts deriveStatus()) und verteilt deren zuvor zugewiesene Checks
// auf verbleibende gesunde Agenten um. Laeuft bei jedem Scheduler-Tick nach
// refreshAssignments() (core/monitor.ts).
const FAILOVER_STRATEGY: DistributionStrategy = "LEAST_LOADED";

// Verhindert wiederholte Failover-Events fuer denselben bereits
// uebernommenen Agenten bei jedem weiteren Tick, waehrend er offline
// bleibt - ein Failover ist ein einmaliges Ereignis pro Ausfall, keine
// staendige Wiederholung.
const alreadyFailedOverAgentIds = new Set<string>();

export async function detectAndHandleFailover(): Promise<void> {
  const agents = await listMonitoringAgents();
  const offlineAgents = agents.filter((agent) => agent.status === "OFFLINE" && agent.lifecycleStatus === "ACTIVE");
  const healthyAgents = agents.filter((agent) => agent.status !== "OFFLINE" && agent.lifecycleStatus === "ACTIVE");

  for (const agent of offlineAgents) {
    if (alreadyFailedOverAgentIds.has(agent.id)) continue;
    if (healthyAgents.length === 0) {
      logger.warn("Failover erkannt, aber kein gesunder Agent zur Uebernahme verfuegbar", { agentId: agent.id });
      continue;
    }

    const failoverId = randomUUID();
    const startedEvent = await createClusterEvent({
      eventType: "FAILOVER_STARTED",
      agentId: agent.id,
      message: `Agent "${agent.name}" ist offline - Umverteilung seiner Checks gestartet`,
      metadata: { failoverId, agentName: agent.name },
    });
    broadcast(createEvent(RealtimeEventType.FAILOVER_STARTED, startedEvent));
    void dispatchWebhookEvent("FAILOVER_STARTED", startedEvent);

    // Least-Loaded unter den verbleibenden gesunden Agenten - derselbe
    // reale Lastausgleich wie der reguläre Scheduler, nur ueber eine
    // vereinfachte, direkte Auswahl (Uebernahme muss sofort passieren, kein
    // voller refreshAssignments()-Durchlauf noetig).
    const target = healthyAgents.reduce((least, candidate) => (candidate.id < least.id ? candidate : least));
    const reassignedCheckIds = await reassignChecksFromAgent(agent.id, target.id, FAILOVER_STRATEGY);

    alreadyFailedOverAgentIds.add(agent.id);

    const finishedEvent = await createClusterEvent({
      eventType: "FAILOVER_FINISHED",
      agentId: target.id,
      message: `${reassignedCheckIds.length} Check(s) von "${agent.name}" auf "${target.name}" uebernommen`,
      metadata: { failoverId, reassignedCheckCount: reassignedCheckIds.length, checkIds: reassignedCheckIds, targetAgentId: target.id },
    });
    broadcast(createEvent(RealtimeEventType.FAILOVER_FINISHED, finishedEvent));
    void dispatchWebhookEvent("FAILOVER_FINISHED", finishedEvent);
    void recordAgentLog({
      agentId: target.id,
      level: "WARN",
      category: "FAILOVER",
      message: `${reassignedCheckIds.length} Check(s) von "${agent.name}" uebernommen`,
    });

    logger.warn("Failover abgeschlossen", { failedAgentId: agent.id, targetAgentId: target.id, reassignedCheckCount: reassignedCheckIds.length });
  }

  // Ein zuvor ausgefallener Agent, der wieder online ist, kann bei einem
  // spaeteren Ausfall erneut einen Failover ausloesen.
  for (const agent of agents) {
    if (agent.status !== "OFFLINE" && alreadyFailedOverAgentIds.has(agent.id)) {
      alreadyFailedOverAgentIds.delete(agent.id);
    }
  }
}
