import { Router } from "express";
import { z } from "zod";
import { listMonitoringAgents } from "../db/monitoring-agents.repository";
import { countAssignments, getAgentDistribution } from "../db/agent-assignments.repository";
import { listAgentLogs } from "../db/agent-logs.repository";
import { getFailoverHistory, listClusterEvents } from "../db/cluster-events.repository";
import { createRollingUpdate, listRollingUpdates } from "../db/rolling-updates.repository";
import { applyRollingUpdateTransition } from "../core/rolling-update";
import { getClusterHaState } from "../core/cluster-node";
import { authenticate } from "../middleware/authenticate";
import { authorizeGlobalAdmin } from "../middleware/authorize";
import { recordAuditLog } from "../core/audit-log";
import { projects } from "../config/projects.config";
import type { ClusterHealthReport, DistributionStrategy } from "../types/cluster.types";
import type { AgentLogLevel } from "../types/agent-log.types";
import type { ClusterEventType } from "../types/cluster-event.types";
import type { RollingUpdateStatus } from "../types/rolling-update.types";

// Phase 14 Teil 6/7/8/9/10/11/14 - Cluster-Uebersicht, -Gesundheit,
// -Verteilung, -Analytics, Agent-Logs und Rolling-Update-Verwaltung.
// Lesezugriff fuer jeden authentifizierten Benutzer (analog zu
// /api/analytics/*), Rolling-Update-Ausloesung/-Uebergaenge OWNER/ADMIN-only
// (aendert den operativen Zustand echter Agenten).
export const clusterRouter = Router();

const DISTRIBUTION_STRATEGIES: DistributionStrategy[] = ["ROUND_ROBIN", "WEIGHTED", "LEAST_LOADED", "REGION_PREFERRED", "HEALTH_PREFERRED"];
const currentStrategy = (): DistributionStrategy =>
  (process.env.CLUSTER_DISTRIBUTION_STRATEGY as DistributionStrategy | undefined) ?? "LEAST_LOADED";

clusterRouter.get("/cluster", authenticate, async (_req, res) => {
  const [agents, ha] = await Promise.all([listMonitoringAgents(), getClusterHaState()]);
  res.json({
    generatedAt: new Date().toISOString(),
    agentCount: agents.length,
    onlineAgentCount: agents.filter((agent) => agent.status === "ONLINE").length,
    strategy: currentStrategy(),
    ha,
  });
});

clusterRouter.get("/cluster/health", authenticate, async (_req, res) => {
  const [agents, assignedCount, ha] = await Promise.all([listMonitoringAgents(), countAssignments(), getClusterHaState()]);
  const strategy = currentStrategy();
  const totalChecks = projects.flatMap((project) => project.checks.filter((check) => check.enabled)).length;

  const report: ClusterHealthReport = {
    generatedAt: new Date().toISOString(),
    totalAgents: agents.length,
    onlineAgents: agents.filter((agent) => agent.status === "ONLINE").length,
    offlineAgents: agents.filter((agent) => agent.status === "OFFLINE").length,
    degradedAgents: agents.filter((agent) => agent.status === "DEGRADED").length,
    totalChecks,
    assignedChecks: assignedCount,
    unassignedChecks: Math.max(0, totalChecks - assignedCount),
    strategy,
    ha,
  };
  res.json(report);
});

clusterRouter.get("/cluster/distribution", authenticate, async (_req, res) => {
  res.json(await getAgentDistribution());
});

const logsQuerySchema = z.object({
  agentId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
  checkId: z.string().trim().min(1).optional(),
  level: z.enum(["INFO", "WARN", "ERROR"]).optional(),
  limit: z.coerce.number().int().min(1).max(500).catch(100),
});

clusterRouter.get("/cluster/logs", authenticate, async (req, res) => {
  const parsed = logsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Filter", details: parsed.error.flatten() });
    return;
  }
  const { agentId, projectId, checkId, level, limit } = parsed.data;
  res.json(
    await listAgentLogs({
      ...(agentId ? { agentId } : {}),
      ...(projectId ? { projectId } : {}),
      ...(checkId ? { checkId } : {}),
      ...(level ? { level: level as AgentLogLevel } : {}),
      limit,
    }),
  );
});

const eventsQuerySchema = z.object({
  eventType: z
    .enum([
      "AGENT_REGISTERED", "AGENT_UPDATED", "AGENT_REMOVED", "AGENT_PAUSED", "AGENT_RESUMED",
      "CHECK_REASSIGNED", "FAILOVER_STARTED", "FAILOVER_FINISHED",
      "CLUSTER_UPDATED", "ROLLING_UPDATE_STARTED", "ROLLING_UPDATE_FINISHED",
    ])
    .optional(),
  agentId: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).catch(100),
});

clusterRouter.get("/cluster/events", authenticate, async (req, res) => {
  const parsed = eventsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Filter", details: parsed.error.flatten() });
    return;
  }
  const { eventType, agentId, limit } = parsed.data;
  res.json(
    await listClusterEvents({
      ...(eventType ? { eventType: eventType as ClusterEventType } : {}),
      ...(agentId ? { agentId } : {}),
      limit,
    }),
  );
});

clusterRouter.get("/cluster/failover", authenticate, async (req, res) => {
  const limit = z.coerce.number().int().min(1).max(200).catch(20).parse(req.query.limit);
  res.json(await getFailoverHistory(limit));
});

// Teil 7 "Cluster Analytics" - buendelt Verteilung, Failover-Historie und
// Agent-Performance (region-analytics.repository.ts, Phase 13) zu einer
// Antwort, damit die Analytics-Seite nicht mehrere Einzelendpunkte
// nacheinander laden muss.
clusterRouter.get("/cluster/analytics", authenticate, async (_req, res) => {
  const [distribution, failoverHistory, agents] = await Promise.all([
    getAgentDistribution(),
    getFailoverHistory(20),
    listMonitoringAgents(),
  ]);
  res.json({
    generatedAt: new Date().toISOString(),
    distribution,
    failoverHistory,
    agentCount: agents.length,
    strategy: currentStrategy(),
  });
});

clusterRouter.get("/cluster/strategies", authenticate, async (_req, res) => {
  res.json({ current: currentStrategy(), available: DISTRIBUTION_STRATEGIES });
});

// ---------------------------------------------------------------------------
// Rolling Updates (Teil 9) - reine Statusverwaltung, kein echter Download.
// ---------------------------------------------------------------------------
const createRollingUpdateSchema = z.object({
  agentId: z.string().trim().min(1),
  targetVersion: z.string().trim().min(1).max(50),
});

clusterRouter.post("/cluster/rolling-updates", authenticate, authorizeGlobalAdmin(), async (req, res) => {
  const parsed = createRollingUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  const update = await createRollingUpdate({
    agentId: parsed.data.agentId,
    targetVersion: parsed.data.targetVersion,
    ...(req.userId ? { createdBy: req.userId } : {}),
  });
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "CLUSTER_ROLLING_UPDATE_CREATED",
    category: "SYSTEM",
    message: `Rolling Update auf ${update.targetVersion} fuer Agent ${update.agentId} angelegt`,
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.status(201).json(update);
});

const listRollingUpdatesQuerySchema = z.object({
  agentId: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).catch(50),
});

clusterRouter.get("/cluster/rolling-updates", authenticate, async (req, res) => {
  const parsed = listRollingUpdatesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Filter", details: parsed.error.flatten() });
    return;
  }
  res.json(await listRollingUpdates(parsed.data.agentId, parsed.data.limit));
});

const transitionSchema = z.object({
  status: z.enum(["DOWNLOADING", "INSTALLING", "RESTARTING", "HEALTHY", "FAILED", "ROLLED_BACK"]),
  error: z.string().trim().min(1).max(2000).optional(),
});

clusterRouter.post("/cluster/rolling-updates/:id/transition", authenticate, authorizeGlobalAdmin(), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Rolling-Update-ID" });
    return;
  }
  const parsed = transitionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }

  const updated = await applyRollingUpdateTransition(id, parsed.data.status as RollingUpdateStatus, parsed.data.error);
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "CLUSTER_ROLLING_UPDATE_TRANSITIONED",
    category: "SYSTEM",
    ...(parsed.data.status === "FAILED" ? { severity: "WARNING" as const } : {}),
    message: `Rolling Update #${id} -> ${parsed.data.status}`,
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.json(updated);
});
