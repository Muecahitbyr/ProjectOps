import { Router } from "express";
import { z } from "zod";
import { createWebhook, deleteWebhook, getWebhookById, listDeliveriesForWebhook, listWebhooks, setWebhookEnabled } from "../db/webhooks.repository";
import { encryptSecret } from "../core/crypto";
import { generateWebhookSecret } from "../core/api-key-auth";
import { authenticate } from "../middleware/authenticate";
import { authorizeOrganizationMembership, authorizeOrganizationRole } from "../middleware/authorize";
import { credentialMintRateLimiter } from "../middleware/rate-limit";
import { notFoundError } from "../core/app-error";
import { recordAuditLog } from "../core/audit-log";
import { WEBHOOK_EVENT_TYPES } from "../types/webhook.types";
import type { WebhookEventType } from "../types/webhook.types";
import type { OrganizationRoleId } from "../types/organization.types";
import type { Request } from "express";

// Phase 15 Teil 7 "Webhooks".
export const webhooksRouter = Router();

const MANAGE_ROLES: OrganizationRoleId[] = ["PLATFORM_OWNER", "ORGANIZATION_OWNER", "ORGANIZATION_ADMIN", "SECURITY_ADMIN"];

async function resolveOrgIdFromQuery(req: Request): Promise<string | undefined> {
  return typeof req.query.organizationId === "string" ? req.query.organizationId : undefined;
}

async function resolveOrgIdFromBody(req: Request): Promise<string | undefined> {
  return typeof req.body?.organizationId === "string" ? req.body.organizationId : undefined;
}

async function resolveOrgIdFromWebhookParam(req: Request): Promise<string | undefined> {
  const webhook = await getWebhookById(req.params.id as string);
  return webhook?.organizationId;
}

webhooksRouter.get("/webhooks", authenticate, authorizeOrganizationMembership(resolveOrgIdFromQuery), async (req, res) => {
  res.json(await listWebhooks(req.query.organizationId as string));
});

const createSchema = z.object({
  organizationId: z.string().trim().min(1),
  url: z.string().trim().url().max(2000),
  events: z.array(z.enum(WEBHOOK_EVENT_TYPES as [WebhookEventType, ...WebhookEventType[]])).min(1),
});

webhooksRouter.post("/webhooks", authenticate, credentialMintRateLimiter, authorizeOrganizationRole(MANAGE_ROLES, resolveOrgIdFromBody), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }

  const { organizationId, url, events } = parsed.data;
  const plaintextSecret = generateWebhookSecret();
  const webhook = await createWebhook(
    { organizationId, url, events, ...(req.userId !== undefined ? { createdBy: req.userId } : {}) },
    encryptSecret(plaintextSecret),
  );

  void recordAuditLog({
    userId: req.userId!,
    action: "WEBHOOK_CREATED",
    category: "SYSTEM",
    message: `Webhook fuer ${webhook.url} erstellt (${webhook.events.join(", ")})`,
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });

  // Das Secret wird genau einmal im Klartext zurueckgegeben - fuer die
  // Signaturpruefung auf Empfaengerseite (HMAC-SHA256 ueber den Body, siehe
  // core/webhook-delivery.ts).
  res.status(201).json({ webhook, plaintextSecret });
});

webhooksRouter.patch("/webhooks/:id", authenticate, authorizeOrganizationRole(MANAGE_ROLES, resolveOrgIdFromWebhookParam), async (req, res) => {
  const parsed = z.object({ enabled: z.boolean() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }
  const updated = await setWebhookEnabled(req.params.id as string, parsed.data.enabled);
  if (!updated) {
    throw notFoundError("Webhook nicht gefunden");
  }
  res.json(updated);
});

webhooksRouter.delete("/webhooks/:id", authenticate, authorizeOrganizationRole(MANAGE_ROLES, resolveOrgIdFromWebhookParam), async (req, res) => {
  const deleted = await deleteWebhook(req.params.id as string);
  if (!deleted) {
    throw notFoundError("Webhook nicht gefunden");
  }
  void recordAuditLog({
    userId: req.userId!,
    action: "WEBHOOK_DELETED",
    category: "SYSTEM",
    message: `Webhook ${req.params.id} geloescht`,
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.status(204).end();
});

webhooksRouter.get("/webhooks/:id/deliveries", authenticate, authorizeOrganizationMembership(resolveOrgIdFromWebhookParam), async (req, res) => {
  const limit = z.coerce.number().int().min(1).max(200).catch(50).parse(req.query.limit);
  res.json(await listDeliveriesForWebhook(req.params.id as string, limit));
});
