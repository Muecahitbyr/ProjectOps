import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  getMonitoringAgentById,
  listMonitoringAgents,
  recordRemoteAgentHeartbeat,
  registerRemoteAgent,
  removeAgent,
  rotateAgentSecretHash,
  setAgentLifecycleStatus,
  updateAgentMetadata,
} from "../db/monitoring-agents.repository";
import { generateAgentSecret, hashAgentSecret, authenticateAgentRequest } from "../core/agent-auth";
import { recordAgentLog } from "../core/agent-log";
import { removeAssignmentsForAgent } from "../db/agent-assignments.repository";
import { createClusterEvent } from "../db/cluster-events.repository";
import { recordAuditLog } from "../core/audit-log";
import { authenticate } from "../middleware/authenticate";
import { authorizeGlobalAdmin } from "../middleware/authorize";
import { agentAuthRateLimiter } from "../middleware/rate-limit";
import { AppError, notFoundError } from "../core/app-error";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";

// Phase 14 Teil 1-3 "Remote Monitoring Agents" / "Agent Authentication" /
// "Agent Discovery". Registrierung/Verwaltung ist bewusst OWNER/ADMIN-only
// (ein Operator registriert einen neuen Agenten und gibt diesem das
// zurueckgegebene Secret in dessen Konfiguration mit) - kein offenes
// Selbst-Registrierungs-Endpunkt ohne Autorisierung ("keine Dummy-
// Authentifizierung"). Heartbeat/Ausfuehrung nutzt danach ausschliesslich
// das Agent Secret (core/agent-auth.ts), keine Benutzer-Session.
export const clusterAgentsRouter = Router();

const registerSchema = z.object({
  id: z.string().trim().min(1).max(100).optional(),
  name: z.string().trim().min(1).max(200),
  region: z.string().trim().min(1).max(100).optional(),
  hostname: z.string().trim().min(1).max(200),
  agentVersion: z.string().trim().min(1).max(50),
  schedulerVersion: z.string().trim().min(1).max(50),
  nodeVersion: z.string().trim().min(1).max(50).optional(),
  capabilities: z.array(z.string()).default([]),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
  cpuInfo: z.string().trim().min(1).max(200).optional(),
  ramMb: z.number().int().positive().optional(),
  diskTotalMb: z.number().int().positive().optional(),
  os: z.string().trim().min(1).max(100),
  dockerVersion: z.string().trim().min(1).max(50).optional(),
  tlsFingerprint: z.string().trim().min(1).max(200).optional(),
});

clusterAgentsRouter.post("/cluster/agents/register", authenticate, authorizeGlobalAdmin(), agentAuthRateLimiter, async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }

  const id = parsed.data.id ?? `remote-${randomUUID()}`;
  if (await getMonitoringAgentById(id)) {
    throw new AppError(409, "CONFLICT", "Agent-ID bereits vergeben");
  }

  const secret = generateAgentSecret();
  const agent = await registerRemoteAgent({
    id,
    name: parsed.data.name,
    region: parsed.data.region ?? null,
    hostname: parsed.data.hostname,
    agentVersion: parsed.data.agentVersion,
    schedulerVersion: parsed.data.schedulerVersion,
    nodeVersion: parsed.data.nodeVersion ?? null,
    capabilities: parsed.data.capabilities,
    tags: parsed.data.tags,
    cpuInfo: parsed.data.cpuInfo ?? null,
    ramMb: parsed.data.ramMb ?? null,
    diskTotalMb: parsed.data.diskTotalMb ?? null,
    os: parsed.data.os,
    dockerVersion: parsed.data.dockerVersion ?? null,
    tlsFingerprint: parsed.data.tlsFingerprint ?? null,
    agentSecretHash: hashAgentSecret(secret),
  });

  const event = await createClusterEvent({ eventType: "AGENT_REGISTERED", agentId: agent.id, message: `Agent "${agent.name}" registriert` });
  broadcast(createEvent(RealtimeEventType.AGENT_REGISTERED, agent));
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "CLUSTER_AGENT_REGISTERED",
    category: "SYSTEM",
    message: `Remote-Agent "${agent.name}" (${agent.id}) registriert`,
    metadata: { agentId: agent.id, clusterEventId: event.id },
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });

  // Das Secret wird genau EINMAL im Klartext zurueckgegeben - danach ist
  // nur noch der Hash gespeichert (agent.hasSecret=true), es kann nicht
  // erneut abgerufen werden.
  res.status(201).json({ agent, secret });
});

// Heartbeat kommt vom Agenten selbst (Secret-authentifiziert, keine
// Benutzer-Session) - siehe core/agent-auth.ts fuer Replay-Schutz.
const heartbeatSchema = z.object({
  cpuInfo: z.string().trim().min(1).max(200).optional(),
  ramMb: z.number().int().positive().optional(),
  diskTotalMb: z.number().int().positive().optional(),
});

clusterAgentsRouter.post("/cluster/agents/:id/heartbeat", agentAuthRateLimiter, async (req, res) => {
  const { agent } = await authenticateAgentRequest(req);
  if (agent.id !== req.params.id) {
    throw new AppError(403, "AGENT_AUTH_INVALID", "Agent-ID im Pfad stimmt nicht mit dem authentifizierten Agenten ueberein");
  }

  const parsed = heartbeatSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }

  const updated = await recordRemoteAgentHeartbeat(agent.id, {
    ...(parsed.data.cpuInfo !== undefined ? { cpuInfo: parsed.data.cpuInfo } : {}),
    ...(parsed.data.ramMb !== undefined ? { ramMb: parsed.data.ramMb } : {}),
    ...(parsed.data.diskTotalMb !== undefined ? { diskTotalMb: parsed.data.diskTotalMb } : {}),
  });
  if (updated) {
    broadcast(createEvent(RealtimeEventType.AGENT_HEARTBEAT, updated));
  }
  res.json(updated);
});

// Agent-authentifiziert (nicht Benutzer-Session) - ein Agent meldet eigene
// Betriebsereignisse (Teil 8 "Agent Logs").
const agentLogSchema = z.object({
  projectId: z.string().trim().min(1).optional(),
  checkId: z.string().trim().min(1).optional(),
  level: z.enum(["INFO", "WARN", "ERROR"]),
  category: z.string().trim().min(1).max(100),
  message: z.string().trim().min(1).max(2000),
});

clusterAgentsRouter.post("/cluster/agents/:id/logs", agentAuthRateLimiter, async (req, res) => {
  const { agent } = await authenticateAgentRequest(req);
  if (agent.id !== req.params.id) {
    throw new AppError(403, "AGENT_AUTH_INVALID", "Agent-ID im Pfad stimmt nicht mit dem authentifizierten Agenten ueberein");
  }
  const parsed = agentLogSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  await recordAgentLog({
    agentId: agent.id,
    ...(parsed.data.projectId ? { projectId: parsed.data.projectId } : {}),
    ...(parsed.data.checkId ? { checkId: parsed.data.checkId } : {}),
    level: parsed.data.level,
    category: parsed.data.category,
    message: parsed.data.message,
  });
  res.status(201).end();
});

clusterAgentsRouter.get("/cluster/agents", authenticate, async (_req, res) => {
  res.json(await listMonitoringAgents());
});

clusterAgentsRouter.get("/cluster/agents/:id", authenticate, async (req, res) => {
  const agent = await getMonitoringAgentById(req.params.id as string);
  if (!agent) {
    throw notFoundError("Agent nicht gefunden");
  }
  res.json(agent);
});

const updateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  region: z.string().trim().min(1).max(100).optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
});

clusterAgentsRouter.patch("/cluster/agents/:id", authenticate, authorizeGlobalAdmin(), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  const agentId = req.params.id as string;
  const updated = await updateAgentMetadata(agentId, {
    ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
    ...(parsed.data.region !== undefined ? { region: parsed.data.region } : {}),
    ...(parsed.data.tags !== undefined ? { tags: parsed.data.tags } : {}),
  });
  if (!updated) {
    throw notFoundError("Agent nicht gefunden");
  }
  await createClusterEvent({ eventType: "AGENT_UPDATED", agentId, message: `Agent "${updated.name}" aktualisiert` });
  broadcast(createEvent(RealtimeEventType.AGENT_UPDATED, updated));
  res.json(updated);
});

clusterAgentsRouter.post("/cluster/agents/:id/pause", authenticate, authorizeGlobalAdmin(), async (req, res) => {
  const agentId = req.params.id as string;
  const updated = await setAgentLifecycleStatus(agentId, "PAUSED");
  if (!updated) {
    throw notFoundError("Agent nicht gefunden");
  }
  await createClusterEvent({ eventType: "AGENT_PAUSED", agentId, message: `Agent "${updated.name}" pausiert` });
  broadcast(createEvent(RealtimeEventType.AGENT_PAUSED, updated));
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "CLUSTER_AGENT_PAUSED",
    category: "SYSTEM",
    message: `Agent "${updated.name}" (${agentId}) pausiert`,
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.json(updated);
});

clusterAgentsRouter.post("/cluster/agents/:id/resume", authenticate, authorizeGlobalAdmin(), async (req, res) => {
  const agentId = req.params.id as string;
  const updated = await setAgentLifecycleStatus(agentId, "ACTIVE");
  if (!updated) {
    throw notFoundError("Agent nicht gefunden");
  }
  await createClusterEvent({ eventType: "AGENT_RESUMED", agentId, message: `Agent "${updated.name}" reaktiviert` });
  broadcast(createEvent(RealtimeEventType.AGENT_RESUMED, updated));
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "CLUSTER_AGENT_RESUMED",
    category: "SYSTEM",
    message: `Agent "${updated.name}" (${agentId}) reaktiviert`,
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.json(updated);
});

clusterAgentsRouter.post("/cluster/agents/:id/revoke", authenticate, authorizeGlobalAdmin(), async (req, res) => {
  const agentId = req.params.id as string;
  const updated = await setAgentLifecycleStatus(agentId, "REVOKED");
  if (!updated) {
    throw notFoundError("Agent nicht gefunden");
  }
  await createClusterEvent({ eventType: "AGENT_UPDATED", agentId, message: `Agent "${updated.name}" widerrufen` });
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "CLUSTER_AGENT_REVOKED",
    category: "SYSTEM",
    severity: "WARNING",
    message: `Agent "${updated.name}" (${agentId}) widerrufen`,
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.json(updated);
});

clusterAgentsRouter.post("/cluster/agents/:id/rotate-secret", authenticate, authorizeGlobalAdmin(), async (req, res) => {
  const agentId = req.params.id as string;
  const secret = generateAgentSecret();
  const updated = await rotateAgentSecretHash(agentId, hashAgentSecret(secret));
  if (!updated) {
    throw notFoundError("Agent nicht gefunden");
  }
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "CLUSTER_AGENT_SECRET_ROTATED",
    category: "SYSTEM",
    message: `Secret fuer Agent "${updated.name}" (${agentId}) rotiert`,
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.json({ agent: updated, secret });
});

clusterAgentsRouter.delete("/cluster/agents/:id", authenticate, authorizeGlobalAdmin(), async (req, res) => {
  const agentId = req.params.id as string;
  const agent = await getMonitoringAgentById(agentId);
  if (!agent) {
    throw notFoundError("Agent nicht gefunden");
  }
  await removeAssignmentsForAgent(agentId);
  await removeAgent(agentId);
  await createClusterEvent({ eventType: "AGENT_REMOVED", message: `Agent "${agent.name}" (${agentId}) entfernt`, metadata: { agentId, agentName: agent.name } });
  broadcast(createEvent(RealtimeEventType.AGENT_REMOVED, { agentId, agentName: agent.name }));
  void recordAuditLog({
    ...(req.userId ? { userId: req.userId } : {}),
    action: "CLUSTER_AGENT_REMOVED",
    category: "SYSTEM",
    severity: "WARNING",
    message: `Agent "${agent.name}" (${agentId}) entfernt`,
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.status(204).end();
});
