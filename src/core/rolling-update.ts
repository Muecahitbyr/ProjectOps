import { transitionRollingUpdate } from "../db/rolling-updates.repository";
import { createClusterEvent } from "../db/cluster-events.repository";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";
import { getMonitoringAgentById } from "../db/monitoring-agents.repository";
import { recordAgentLog } from "./agent-log";
import type { RollingUpdate, RollingUpdateStatus } from "../types/rolling-update.types";

// Phase 14 Teil 9 "Rolling Updates" - duenner Wrapper um
// db/rolling-updates.repository.ts's Statusmaschine: broadcastet
// ROLLING_UPDATE_STARTED (beim Uebergang PENDING -> DOWNLOADING) und
// ROLLING_UPDATE_FINISHED (bei jedem Erreichen eines Endzustands) und
// haelt eine persistente cluster_events-Spur. Bewusst KEIN echter
// Software-Download - reine Statusverwaltung (siehe Auftrag).
export async function applyRollingUpdateTransition(id: number, nextStatus: RollingUpdateStatus, error?: string): Promise<RollingUpdate> {
  const updated = await transitionRollingUpdate(id, nextStatus, error);
  const agent = await getMonitoringAgentById(updated.agentId);
  const agentName = agent?.name ?? updated.agentId;

  void recordAgentLog({
    agentId: updated.agentId,
    level: nextStatus === "FAILED" ? "ERROR" : "INFO",
    category: "ROLLING_UPDATE",
    message: `Status -> ${nextStatus}${error ? `: ${error}` : ""}`,
  });

  if (nextStatus === "DOWNLOADING") {
    const event = await createClusterEvent({
      eventType: "ROLLING_UPDATE_STARTED",
      agentId: updated.agentId,
      message: `Rolling Update auf Version ${updated.targetVersion} fuer "${agentName}" gestartet`,
      metadata: { rollingUpdateId: updated.id, targetVersion: updated.targetVersion },
    });
    broadcast(createEvent(RealtimeEventType.ROLLING_UPDATE_STARTED, event));
  }

  if (nextStatus === "HEALTHY" || nextStatus === "FAILED" || nextStatus === "ROLLED_BACK") {
    const event = await createClusterEvent({
      eventType: "ROLLING_UPDATE_FINISHED",
      agentId: updated.agentId,
      message: `Rolling Update fuer "${agentName}" beendet: ${nextStatus}`,
      metadata: { rollingUpdateId: updated.id, targetVersion: updated.targetVersion, status: nextStatus },
    });
    broadcast(createEvent(RealtimeEventType.ROLLING_UPDATE_FINISHED, event));
  }

  return updated;
}
