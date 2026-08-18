import { Router } from "express";
import { getCheckCountsByAgent, getMonitoringAgentById, listMonitoringAgents } from "../db/monitoring-agents.repository";
import { authenticate } from "../middleware/authenticate";
import { notFoundError } from "../core/app-error";

// Phase 13 Teil 1 "Monitoring Agents" - reine Lesezugriffe (Registrierung/
// Heartbeat passiert serverseitig ueber core/local-agent.ts bei jedem
// Scheduler-Tick, nicht per HTTP-Request eines Clients).
export const monitoringAgentsRouter = Router();

monitoringAgentsRouter.get("/monitoring-agents", authenticate, async (_req, res) => {
  const [agents, checkCounts] = await Promise.all([listMonitoringAgents(), getCheckCountsByAgent()]);
  const countsByAgent = new Map(checkCounts.map((row) => [row.agentId, row.checkCount]));
  res.json(agents.map((agent) => ({ ...agent, checkCountLast24h: countsByAgent.get(agent.id) ?? 0 })));
});

monitoringAgentsRouter.get("/monitoring-agents/:id", authenticate, async (req, res) => {
  const agent = await getMonitoringAgentById(req.params.id as string);
  if (!agent) {
    throw notFoundError("Monitoring-Agent nicht gefunden");
  }
  res.json(agent);
});
