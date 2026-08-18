import { hostname } from "node:os";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { upsertClusterNodeHeartbeat, listClusterNodes } from "../db/cluster-nodes.repository";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";
import type { ClusterHaState, ClusterNode } from "../types/cluster.types";

// Phase 14 Teil 11 "High Availability" - dieser Prozess (in dieser
// Architektur der einzige laufende ProjectOps-Backend-Prozess) meldet sich
// als PRIMARY-Cluster-Knoten. Weitere echte Instanzen koennten sich ueber
// denselben Mechanismus (POST /api/cluster/nodes/heartbeat, siehe
// routes/cluster.routes.ts) melden - werden hier aber nicht vorgetaeuscht.
function resolveNodeId(): string {
  return process.env.CLUSTER_NODE_ID?.trim() || `node-${hostname()}`;
}

function resolveBackendVersion(): string {
  try {
    const raw = readFileSync(join(process.cwd(), "package.json"), "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "version" in parsed && typeof parsed.version === "string") {
      return parsed.version;
    }
  } catch {
    // Kein package.json lesbar - "unknown" statt einer erfundenen Version.
  }
  return "unknown";
}

let cachedNodeId: string | undefined;

export function getLocalClusterNodeId(): string {
  cachedNodeId ??= resolveNodeId();
  return cachedNodeId;
}

// Bei jedem Scheduler-Tick aufgerufen (analog zu heartbeatLocalAgent()) -
// CLUSTER_NODE_ROLE erlaubt, einen Prozess explizit als SECONDARY zu
// deployen (z.B. ein Standby); ohne explizite Konfiguration ist der erste
// (und in dieser Umgebung einzige) Knoten PRIMARY.
export async function heartbeatLocalClusterNode(): Promise<ClusterNode> {
  const role = process.env.CLUSTER_NODE_ROLE === "SECONDARY" ? "SECONDARY" : "PRIMARY";
  return upsertClusterNodeHeartbeat({
    id: getLocalClusterNodeId(),
    role,
    hostname: hostname(),
    backendVersion: resolveBackendVersion(),
  });
}

// "Election Status"/"Split Brain Detection" (Auftrag: "Keine echte Leader
// Election notwendig. Nur Architektur") - bei genau einem HEALTHY
// PRIMARY-Knoten ist die Lage STABLE; bei mehreren gleichzeitig HEALTHY
// gemeldeten PRIMARY-Knoten wird ehrlich SPLIT_BRAIN_SUSPECTED gemeldet statt
// stillschweigend einen davon zu bevorzugen; ohne jeden HEALTHY PRIMARY ist
// die Lage NO_LEADER.
export async function getClusterHaState(): Promise<ClusterHaState> {
  const nodes = await listClusterNodes();
  const healthyPrimaries = nodes.filter((node) => node.role === "PRIMARY" && node.status === "HEALTHY");

  if (healthyPrimaries.length > 1) {
    return { nodes, leaderId: null, electionStatus: "SPLIT_BRAIN_SUSPECTED", splitBrainSuspected: true };
  }
  const leader = healthyPrimaries[0];
  if (!leader) {
    return { nodes, leaderId: null, electionStatus: "NO_LEADER", splitBrainSuspected: false };
  }
  return { nodes, leaderId: leader.id, electionStatus: "STABLE", splitBrainSuspected: false };
}

export function broadcastClusterUpdated(message: string): void {
  broadcast(createEvent(RealtimeEventType.CLUSTER_UPDATED, { message, generatedAt: new Date().toISOString() }));
}
