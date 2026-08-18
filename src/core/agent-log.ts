import { createAgentLogEntry } from "../db/agent-logs.repository";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";
import { logger } from "./logger";
import type { CreateAgentLogInput } from "../types/agent-log.types";

// Phase 14 Teil 8 "Agent Logs" - duenner Wrapper (analog zu
// core/audit-log.ts): speichert + broadcastet AGENT_LOG_CREATED fuer
// echtes Live-Streaming im Frontend. Ein fehlgeschlagenes Log darf nie die
// eigentliche Aktion (Failover/Rolling Update/Check) verhindern.
export async function recordAgentLog(input: CreateAgentLogInput): Promise<void> {
  try {
    const entry = await createAgentLogEntry(input);
    broadcast(createEvent(RealtimeEventType.AGENT_LOG_CREATED, entry));
  } catch (err) {
    logger.error("Agent-Log konnte nicht gespeichert werden", {
      agentId: input.agentId,
      error: err instanceof Error ? err.message : "Unbekannter Fehler",
    });
  }
}
