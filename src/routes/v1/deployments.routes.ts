import { Router } from "express";
import { z } from "zod";
import {
  createDeployment,
  countDeployments,
  getDeploymentById,
  listDeployments,
} from "../../db/deployments.repository";
import { getProjectIdsForOrganization, getProjectOrganizationId } from "../../db/projects.repository";
import { listProjectIdsForTeam } from "../../db/teams.repository";
import {
  authenticateApiKey,
  apiKeyRateLimiter,
  apiKeyWriteRateLimiter,
  enforceApiQuota,
  requireApiScope,
  trackApiUsage,
} from "../../middleware/api-key-auth";
import { requireIdempotency } from "../../middleware/idempotency";
import { paginatedResponse, parsePagination, toDeploymentDto } from "./shared";
import { notFoundError } from "../../core/app-error";
import { recordAuditLog } from "../../core/audit-log";
import { broadcast } from "../../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../../realtime/events";
import { dispatchWebhookEvent } from "../../core/webhook-dispatch";
import {
  DEPLOYMENT_STATUSES,
  MAX_DEPLOYMENT_DESCRIPTION_LENGTH,
  MAX_DEPLOYMENT_ENVIRONMENT_LENGTH,
  MAX_DEPLOYMENT_VERSION_LENGTH,
} from "../../types/deployment.types";
import type { DeploymentStatus } from "../../types/deployment.types";

// Phase 27 "Enterprise Deployment Tracking & Change Correlation" -
// deployments:write ist der eigentliche Praxisfall dieser Phase: ein
// CI/CD-System (GitHub Actions/GitLab CI/...) meldet nach jedem Deploy
// per POST hier ein reales Ereignis (kein UI-Zwang, keine erfundenen
// Daten). Struktur/Tenant-Isolation exakt analog zu routes/v1/slo.routes.ts
// (POST /v1/slo).
export const v1DeploymentsRouter = Router();

async function resolveOrgAndTeamProjectIds(organizationId: string, teamId: string | null): Promise<string[]> {
  let projectIds = await getProjectIdsForOrganization(organizationId);
  if (teamId) {
    const teamProjectIds = new Set(await listProjectIdsForTeam(teamId));
    projectIds = projectIds.filter((id) => teamProjectIds.has(id));
  }
  return projectIds;
}

const listQuerySchema = z.object({
  projectId: z.string().trim().min(1).optional(),
  environment: z.string().trim().min(1).max(MAX_DEPLOYMENT_ENVIRONMENT_LENGTH).optional(),
  status: z.enum(DEPLOYMENT_STATUSES as [DeploymentStatus, ...DeploymentStatus[]]).optional(),
});

v1DeploymentsRouter.get(
  "/v1/deployments",
  authenticateApiKey,
  requireApiScope("deployments:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Ungueltige Filter", code: "VALIDATION_ERROR", details: parsed.error.flatten() });
      return;
    }

    // Tenant Isolation - dieselbe projectIds-Schnittmenge wie jeder andere
    // v1-Listenendpunkt (siehe v1/incidents.routes.ts).
    const orgProjectIds = await resolveOrgAndTeamProjectIds(context.organizationId, context.teamId);
    if (parsed.data.projectId && !orgProjectIds.includes(parsed.data.projectId)) {
      res.json(paginatedResponse([], parsePagination(req), 0));
      return;
    }
    const projectIds = parsed.data.projectId ? [parsed.data.projectId] : orgProjectIds;
    const pagination = parsePagination(req);

    if (projectIds.length === 0) {
      res.json(paginatedResponse([], pagination, 0));
      return;
    }

    const filter = {
      projectIds,
      ...(parsed.data.environment ? { environment: parsed.data.environment } : {}),
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
    };
    const [deployments, total] = await Promise.all([
      listDeployments({ ...filter, limit: pagination.pageSize, offset: pagination.offset }),
      countDeployments(filter),
    ]);
    res.json(paginatedResponse(deployments.map(toDeploymentDto), pagination, total));
  },
);

async function assertDeploymentVisible(id: number, organizationId: string, teamId: string | null) {
  const deployment = await getDeploymentById(id);
  if (!deployment) {
    throw notFoundError("Deployment nicht gefunden");
  }
  const deploymentOrgId = await getProjectOrganizationId(deployment.projectId);
  if (!deploymentOrgId || deploymentOrgId !== organizationId) {
    throw notFoundError("Deployment nicht gefunden");
  }
  if (teamId) {
    const teamProjectIds = new Set(await listProjectIdsForTeam(teamId));
    if (!teamProjectIds.has(deployment.projectId)) {
      throw notFoundError("Deployment nicht gefunden");
    }
  }
  return deployment;
}

v1DeploymentsRouter.get(
  "/v1/deployments/:id",
  authenticateApiKey,
  requireApiScope("deployments:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ungueltige Deployment-ID", code: "VALIDATION_ERROR" });
      return;
    }
    const deployment = await assertDeploymentVisible(id, context.organizationId, context.teamId);
    res.json({ data: toDeploymentDto(deployment) });
  },
);

const createDeploymentSchema = z
  .object({
    projectId: z.string().trim().min(1),
    environment: z.string().trim().min(1).max(MAX_DEPLOYMENT_ENVIRONMENT_LENGTH).optional(),
    version: z.string().trim().min(1).max(MAX_DEPLOYMENT_VERSION_LENGTH),
    status: z.enum(DEPLOYMENT_STATUSES as [DeploymentStatus, ...DeploymentStatus[]]).optional(),
    description: z.string().trim().max(MAX_DEPLOYMENT_DESCRIPTION_LENGTH).optional(),
    deployedAt: z.coerce.date().optional(),
  })
  .strict();

v1DeploymentsRouter.post(
  "/v1/deployments",
  authenticateApiKey,
  requireApiScope("deployments:write"),
  apiKeyWriteRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  requireIdempotency(),
  async (req, res) => {
    const context = req.apiKeyContext!;
    const parsed = createDeploymentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Ungueltige Eingabe", code: "VALIDATION_ERROR", details: parsed.error.flatten() });
      return;
    }

    // Projekt-Scope muss zur Organisation/zum Team des Keys gehoeren - 404
    // statt 403 (kein Existenz-Leak), identisches Muster zu v1/slo.
    // routes.ts POST /v1/slo.
    const projectOrgId = await getProjectOrganizationId(parsed.data.projectId);
    if (!projectOrgId || projectOrgId !== context.organizationId) {
      throw notFoundError("Projekt nicht gefunden");
    }
    if (context.teamId) {
      const teamProjectIds = new Set(await listProjectIdsForTeam(context.teamId));
      if (!teamProjectIds.has(parsed.data.projectId)) {
        throw notFoundError("Projekt nicht gefunden");
      }
    }

    const { projectId, environment, version, status, description, deployedAt } = parsed.data;
    const deployment = await createDeployment({
      projectId,
      ...(environment !== undefined ? { environment } : {}),
      version,
      ...(status !== undefined ? { status } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(deployedAt !== undefined ? { deployedAt: deployedAt.toISOString() } : {}),
    });

    broadcast(createEvent(RealtimeEventType.DEPLOYMENT_CREATED, deployment));
    void dispatchWebhookEvent("DEPLOYMENT_CREATED", deployment, context.organizationId);
    void recordAuditLog({
      action: "API_DEPLOYMENT_CREATED",
      category: "DEPLOYMENT",
      projectId,
      message: `Deployment ${deployment.version} (${deployment.environment}) ueber die externe API erfasst`,
      metadata: { deploymentId: deployment.id, organizationId: context.organizationId, actorApiKeyId: context.apiKeyId },
      ...(req.ip ? { ipAddress: req.ip } : {}),
    });

    res.status(201).json({ data: toDeploymentDto(deployment) });
  },
);
