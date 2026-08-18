import { listMonitoringAgents } from "../db/monitoring-agents.repository";
import { getAgentDistribution, listAgentAssignments, upsertAssignment } from "../db/agent-assignments.repository";
import { createClusterEvent } from "../db/cluster-events.repository";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";
import { getLocalAgentId } from "./local-agent";
import { logger } from "./logger";
import { projects } from "../config/projects.config";
import type { DistributionStrategy } from "../types/cluster.types";
import type { MonitoringAgent } from "../types/monitoring-agent.types";

// Phase 14 Teil 4 "Distributed Scheduler" - eine echte, konfigurierbare
// Zuweisungs-Berechnung (welcher Agent ist fuer welchen Check zustaendig).
// WICHTIG: dies ersetzt NICHT die bestehende Check-Ausfuehrung (core/
// monitor.ts fuehrt Checks weiterhin im selben Prozess aus, siehe Auftrag
// "Keine bestehende Monitoring-Logik ersetzen") - solange nur ein echter
// Agent registriert ist, laufen alle Zuweisungen ehrlich auf ihn. Sobald
// echte Remote-Agenten sich registrieren (routes/cluster.routes.ts), nimmt
// die Verteilung sie automatisch mit auf.
const DEFAULT_STRATEGY: DistributionStrategy = (process.env.CLUSTER_DISTRIBUTION_STRATEGY as DistributionStrategy | undefined) ?? "LEAST_LOADED";

// In-Memory-Cache der aktuellen Zuweisung (checkId -> agentId), einmal pro
// Scheduler-Tick per refreshAssignments() befuellt (core/monitor.ts) - so
// braucht core/monitor.ts's insertResult()-Aufruf pro Check keine eigene
// DB-Abfrage (kein N+1), sondern nur einen synchronen Map-Zugriff.
const assignmentCache = new Map<string, string>();

export function getAssignedAgentId(checkId: string): string {
  return assignmentCache.get(checkId) ?? getLocalAgentId();
}

function eligibleAgents(agents: MonitoringAgent[]): MonitoringAgent[] {
  return agents.filter((agent) => agent.lifecycleStatus === "ACTIVE" && agent.status !== "OFFLINE");
}

function pickRoundRobin(agents: MonitoringAgent[], index: number): MonitoringAgent {
  return agents[index % agents.length]!;
}

// "Weighted": Gewicht aus echter, gemeldeter Kapazitaet (RAM) statt eines
// erfundenen statischen Werts - ein Agent mit mehr RAM erhaelt
// proportional mehr Checks. Ohne RAM-Angabe zaehlt ein neutrales Gewicht 1.
function pickWeighted(agents: MonitoringAgent[], index: number): MonitoringAgent {
  const weights = agents.map((agent) => agent.ramMb ?? 1024);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = (index * 997) % totalWeight; // deterministische Pseudo-Verteilung ueber den Check-Index
  for (let i = 0; i < agents.length; i++) {
    if (cursor < weights[i]!) return agents[i]!;
    cursor -= weights[i]!;
  }
  return agents[agents.length - 1]!;
}

function pickLeastLoaded(agents: MonitoringAgent[], loadByAgent: Map<string, number>): MonitoringAgent {
  return agents.reduce((least, agent) => ((loadByAgent.get(agent.id) ?? 0) < (loadByAgent.get(least.id) ?? 0) ? agent : least));
}

// Hysterese gegen Oszillation: ohne dies wuerde ein neu hinzugekommener,
// leerer Agent bei einem Tick ALLE Checks des vollen Agenten uebernehmen
// (jetzt selbst am staerksten belastet) und beim naechsten Tick wandern sie
// komplett zurueck - ein staendiges Hin-und-Her statt einer stabilen
// Verteilung. Ein Check bleibt daher bei seinem aktuellen Agenten, solange
// dessen Last hoechstens um 1 groesser ist als die des am geringsten
// belasteten in Frage kommenden Agenten.
const STICKINESS_THRESHOLD = 1;

function pickLeastLoadedSticky(agents: MonitoringAgent[], loadByAgent: Map<string, number>, currentAgentId: string | undefined): MonitoringAgent {
  const leastLoaded = pickLeastLoaded(agents, loadByAgent);
  if (!currentAgentId) return leastLoaded;

  const currentAgent = agents.find((agent) => agent.id === currentAgentId);
  if (!currentAgent) return leastLoaded;

  const currentLoad = loadByAgent.get(currentAgentId) ?? 0;
  const leastLoad = loadByAgent.get(leastLoaded.id) ?? 0;
  return currentLoad - leastLoad <= STICKINESS_THRESHOLD ? currentAgent : leastLoaded;
}

// "Region Preferred": bevorzugt Agenten mit konfigurierter Region (siehe
// AGENT_REGION in core/local-agent.ts) vor Agenten ohne Region - es gibt
// aktuell kein projektspezifisches Regionsfeld, gegen das echt abgeglichen
// werden koennte (keine Fake-Zuordnung erfunden), daher dieser ehrliche,
// dokumentierte Naeherungswert. Gleichstand wird per Least-Loaded entschieden.
function pickRegionPreferred(agents: MonitoringAgent[], loadByAgent: Map<string, number>, currentAgentId: string | undefined): MonitoringAgent {
  const withRegion = agents.filter((agent) => agent.region !== null);
  return pickLeastLoadedSticky(withRegion.length > 0 ? withRegion : agents, loadByAgent, currentAgentId);
}

// "Health Preferred": bevorzugt ONLINE vor DEGRADED (OFFLINE ist bereits
// durch eligibleAgents() ausgeschlossen), Gleichstand per Least-Loaded.
function pickHealthPreferred(agents: MonitoringAgent[], loadByAgent: Map<string, number>, currentAgentId: string | undefined): MonitoringAgent {
  const online = agents.filter((agent) => agent.status === "ONLINE");
  return pickLeastLoadedSticky(online.length > 0 ? online : agents, loadByAgent, currentAgentId);
}

export interface RefreshAssignmentsResult {
  strategy: DistributionStrategy;
  totalChecks: number;
  reassignedCount: number;
}

// Wird bei jedem Scheduler-Tick aufgerufen (core/monitor.ts, direkt nach dem
// lokalen Agent-Heartbeat) - berechnet die Zuweisung fuer alle aktivierten
// Checks neu und persistiert nur tatsaechliche Aenderungen.
export async function refreshAssignments(strategy: DistributionStrategy = DEFAULT_STRATEGY): Promise<RefreshAssignmentsResult> {
  const agents = eligibleAgents(await listMonitoringAgents());
  const allCheckIds = projects.flatMap((project) => project.checks.filter((check) => check.enabled).map((check) => check.id));

  assignmentCache.clear();
  if (agents.length === 0) {
    return { strategy, totalChecks: allCheckIds.length, reassignedCount: 0 };
  }

  const distribution = await getAgentDistribution();
  const loadByAgent = new Map(distribution.map((entry) => [entry.agentId, entry.assignedCheckCount]));
  const currentAssignments = new Map((await listAgentAssignments()).map((assignment) => [assignment.checkId, assignment.agentId]));

  let reassignedCount = 0;
  for (const [index, checkId] of allCheckIds.entries()) {
    const currentAgentId = currentAssignments.get(checkId);
    let chosen: MonitoringAgent;
    switch (strategy) {
      case "ROUND_ROBIN":
        chosen = pickRoundRobin(agents, index);
        break;
      case "WEIGHTED":
        chosen = pickWeighted(agents, index);
        break;
      case "REGION_PREFERRED":
        chosen = pickRegionPreferred(agents, loadByAgent, currentAgentId);
        break;
      case "HEALTH_PREFERRED":
        chosen = pickHealthPreferred(agents, loadByAgent, currentAgentId);
        break;
      case "LEAST_LOADED":
      default:
        chosen = pickLeastLoadedSticky(agents, loadByAgent, currentAgentId);
        break;
    }

    assignmentCache.set(checkId, chosen.id);
    loadByAgent.set(chosen.id, (loadByAgent.get(chosen.id) ?? 0) + 1);

    const { changed, previousAgentId } = await upsertAssignment(checkId, chosen.id, strategy);
    if (changed) {
      reassignedCount++;
      const event = await createClusterEvent({
        eventType: "CHECK_REASSIGNED",
        agentId: chosen.id,
        message: previousAgentId
          ? `Check "${checkId}" von Agent ${previousAgentId} zu ${chosen.id} umverteilt (${strategy})`
          : `Check "${checkId}" erstmals Agent ${chosen.id} zugewiesen (${strategy})`,
        metadata: { checkId, previousAgentId, newAgentId: chosen.id, strategy },
      });
      broadcast(createEvent(RealtimeEventType.CHECK_REASSIGNED, event));
    }
  }

  if (reassignedCount > 0) {
    logger.info("Check-Zuweisung aktualisiert", { strategy, reassignedCount, totalChecks: allCheckIds.length });
  }

  return { strategy, totalChecks: allCheckIds.length, reassignedCount };
}
