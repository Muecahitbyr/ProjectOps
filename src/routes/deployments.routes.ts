import { Router } from "express";
import { z } from "zod";
import type { Request } from "express";
import {
  createDeployment,
  deleteDeployment,
  getDeploymentById,
  listDeployments,
} from "../db/deployments.repository";
import { getProjectOrganizationId } from "../db/projects.repository";
import { authenticate } from "../middleware/authenticate";
import { authorizeProjectAccess, authorizeRole } from "../middleware/authorize";
import { notFoundError } from "../core/app-error";
import { recordAuditLog } from "../core/audit-log";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";
import { dispatchWebhookEvent } from "../core/webhook-dispatch";
import {
  DEPLOYMENT_STATUSES,
  DEFAULT_DEPLOYMENT_CORRELATION_WINDOW_MINUTES,
  MAX_DEPLOYMENT_CORRELATION_WINDOW_MINUTES,
  MAX_DEPLOYMENT_DESCRIPTION_LENGTH,
  MAX_DEPLOYMENT_ENVIRONMENT_LENGTH,
  MAX_DEPLOYMENT_VERSION_LENGTH,
} from "../types/deployment.types";
import type { DeploymentStatus } from "../types/deployment.types";

// Phase 27 "Enterprise Deployment Tracking & Change Correlation" - loest das
// seit Phase 10 vorbereitete, bis dahin immer leere
// "activeDeployments"-Feld ein (types/diagnostic-snapshot.types.ts). Eigener
// Router (statt in projects.routes.ts einsortiert) analog zu on-call.
// routes.ts/webhooks.routes.ts - Deployments sind projektgebundene
// Ressourcen mit eigenem Lebenszyklus, kein Unterpunkt der bestehenden
// Projekt-CRUD-Route.
export const deploymentsRouter = Router();

const DEPLOY_ROLES = ["OWNER", "ADMIN", "DEVELOPER"] as const;
const MANAGE_ROLES = ["OWNER", "ADMIN"] as const;

function resolveProjectIdFromParam(req: Request): string | undefined {
  return typeof req.params.projectId === "string" ? req.params.projectId : undefined;
}

async function resolveProjectIdForDeployment(req: Request): Promise<string | undefined> {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return undefined;
  const deployment = await getDeploymentById(id);
  return deployment?.projectId;
}

const listQuerySchema = z.object({
  environment: z.string().trim().min(1).max(MAX_DEPLOYMENT_ENVIRONMENT_LENGTH).optional(),
  status: z.enum(DEPLOYMENT_STATUSES as [DeploymentStatus, ...DeploymentStatus[]]).optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

deploymentsRouter.get(
  "/projects/:projectId/deployments",
  authenticate,
  authorizeProjectAccess(resolveProjectIdFromParam),
  async (req, res) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Ungueltige Filter", details: parsed.error.flatten() });
      return;
    }
    const deployments = await listDeployments({
      projectId: req.params.projectId as string,
      ...(parsed.data.environment ? { environment: parsed.data.environment } : {}),
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
      ...(parsed.data.limit !== undefined ? { limit: parsed.data.limit } : {}),
    });
    res.json(deployments);
  },
);

const createDeploymentSchema = z
  .object({
    environment: z.string().trim().min(1).max(MAX_DEPLOYMENT_ENVIRONMENT_LENGTH).optional(),
    version: z.string().trim().min(1).max(MAX_DEPLOYMENT_VERSION_LENGTH),
    status: z.enum(DEPLOYMENT_STATUSES as [DeploymentStatus, ...DeploymentStatus[]]).optional(),
    description: z.string().trim().max(MAX_DEPLOYMENT_DESCRIPTION_LENGTH).optional(),
    deployedAt: z.coerce.date().optional(),
  })
  .strict();

deploymentsRouter.post(
  "/projects/:projectId/deployments",
  authenticate,
  authorizeRole([...DEPLOY_ROLES], resolveProjectIdFromParam),
  async (req, res) => {
    const parsed = createDeploymentSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
      return;
    }
    const projectId = req.params.projectId as string;
    const { environment, version, status, description, deployedAt } = parsed.data;
    const deployment = await createDeployment({
      projectId,
      ...(environment !== undefined ? { environment } : {}),
      version,
      ...(status !== undefined ? { status } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(req.userId ? { deployedBy: req.userId } : {}),
      ...(deployedAt !== undefined ? { deployedAt: deployedAt.toISOString() } : {}),
    });

    broadcast(createEvent(RealtimeEventType.DEPLOYMENT_CREATED, deployment));
    const organizationId = await getProjectOrganizationId(projectId);
    void dispatchWebhookEvent("DEPLOYMENT_CREATED", deployment, organizationId ?? undefined);
    void recordAuditLog({
      ...(req.userId ? { userId: req.userId } : {}),
      action: "DEPLOYMENT_CREATED",
      category: "DEPLOYMENT",
      projectId,
      message: `Deployment ${deployment.version} (${deployment.environment}) fuer Projekt ${projectId} erfasst`,
      metadata: { deploymentId: deployment.id, environment: deployment.environment, status: deployment.status },
      ...(req.ip ? { ipAddress: req.ip } : {}),
    });
    res.status(201).json(deployment);
  },
);

deploymentsRouter.delete(
  "/deployments/:id",
  authenticate,
  authorizeRole([...MANAGE_ROLES], resolveProjectIdForDeployment),
  async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Ungueltige Deployment-ID" });
      return;
    }
    const deployment = await getDeploymentById(id);
    if (!deployment) {
      throw notFoundError("Deployment nicht gefunden");
    }
    await deleteDeployment(id);

    broadcast(createEvent(RealtimeEventType.DEPLOYMENT_DELETED, { id, projectId: deployment.projectId }));
    void recordAuditLog({
      ...(req.userId ? { userId: req.userId } : {}),
      action: "DEPLOYMENT_DELETED",
      category: "DEPLOYMENT",
      projectId: deployment.projectId,
      message: `Deployment ${deployment.version} (${deployment.environment}) geloescht`,
      metadata: { deploymentId: id },
      ...(req.ip ? { ipAddress: req.ip } : {}),
    });
    res.status(204).end();
  },
);

// Auftragspunkt "Incident-Korrelation" - eigener, read-only Endpunkt statt
// die bestehende Incident-DTO zu erweitern (vermeidet Regressionsrisiko fuer
// den etablierten, vom Frontend bereits typisierten Incident-Vertrag) -
// exakt dasselbe Prinzip wie GET /services/:id/impact (Phase 25) neben der
// eigentlichen Service-Detailroute.
export function resolveDeploymentCorrelationWindowMinutes(req: Request): number {
  const raw = Number(req.query.windowMinutes);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_DEPLOYMENT_CORRELATION_WINDOW_MINUTES;
  return Math.min(raw, MAX_DEPLOYMENT_CORRELATION_WINDOW_MINUTES);
}
