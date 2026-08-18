import { Router } from "express";
import { z } from "zod";
import { createApiKeyIfUnderQuota, getApiKeyById, listApiKeys, revokeApiKey, rotateApiKeyHash } from "../db/api-keys.repository";
import { getOrganizationById } from "../db/organizations.repository";
import { getTeamById } from "../db/teams.repository";
import { apiKeyPrefix, generateApiKeyPlaintext, hashApiKey } from "../core/api-key-auth";
import { authenticate } from "../middleware/authenticate";
import { authorizeOrganizationMembership, authorizeOrganizationRole } from "../middleware/authorize";
import { credentialMintRateLimiter } from "../middleware/rate-limit";
import { AppError, notFoundError } from "../core/app-error";
import { recordAuditLog } from "../core/audit-log";
import { dispatchWebhookEvent } from "../core/webhook-dispatch";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";
import { getPlanLimits } from "../config/plan-limits";
import { API_SCOPES, isApiScope } from "../types/api-scope.types";
import type { OrganizationRoleId } from "../types/organization.types";
import type { Request } from "express";

// Phase 15 Teil 5 "API Keys" - Verwaltung ist sicherheitssensibel, daher
// zusaetzlich zu ORGANIZATION_OWNER/ADMIN auch SECURITY_ADMIN erlaubt.
// Phase 16 erweitert um: Scopes (validiert gegen die real durchgesetzte
// Liste, siehe types/api-scope.types.ts), optionale Team-Zuordnung,
// maxApiKeys-Plan-Limit (config/plan-limits.ts) und Webhook-Dispatch.
export const apiKeysRouter = Router();

const MANAGE_ROLES: OrganizationRoleId[] = ["PLATFORM_OWNER", "ORGANIZATION_OWNER", "ORGANIZATION_ADMIN", "SECURITY_ADMIN"];

async function resolveOrgIdFromQuery(req: Request): Promise<string | undefined> {
  return typeof req.query.organizationId === "string" ? req.query.organizationId : undefined;
}

async function resolveOrgIdFromBody(req: Request): Promise<string | undefined> {
  return typeof req.body?.organizationId === "string" ? req.body.organizationId : undefined;
}

apiKeysRouter.get("/api-keys", authenticate, authorizeOrganizationMembership(resolveOrgIdFromQuery), async (req, res) => {
  res.json(await listApiKeys(req.query.organizationId as string));
});

const createSchema = z.object({
  organizationId: z.string().trim().min(1),
  teamId: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).max(200),
  scopes: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  expiresAt: z.string().trim().min(1).optional(),
});

apiKeysRouter.post("/api-keys", authenticate, credentialMintRateLimiter, authorizeOrganizationRole(MANAGE_ROLES, resolveOrgIdFromBody), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Eingabe", details: parsed.error.flatten() });
    return;
  }

  const { organizationId, teamId, description, scopes, expiresAt } = parsed.data;

  // Auftragspunkt 2 "API-Key Scopes" - nur real durchgesetzte Scopes duerfen
  // vergeben werden; ein Tippfehler oder erfundener Scope wuerde sonst
  // stillschweigend nie greifen (weder erlauben noch verbieten). Explizit
  // ablehnen statt still ignorieren.
  const invalidScopes = (scopes ?? []).filter((scope) => !isApiScope(scope));
  if (invalidScopes.length > 0) {
    throw new AppError(400, "VALIDATION_ERROR", `Unbekannte Scopes: ${invalidScopes.join(", ")}`, { validScopes: API_SCOPES });
  }

  // Auftragspunkt 10 "optional Team zuordnen" - das Team muss zur selben
  // Organisation gehoeren wie der Key, sonst koennte ein API-Key
  // faelschlich mit dem Team-Kontext einer FREMDEN Organisation erstellt
  // werden (Tenant-Escape ueber einen manipulierten teamId-Body-Wert).
  if (teamId) {
    const team = await getTeamById(teamId);
    if (!team || team.organizationId !== organizationId) {
      throw notFoundError("Team nicht gefunden oder gehoert nicht zu dieser Organisation");
    }
  }

  // Auftragspunkt 7 "API Quotas" (maxApiKeys) - Plan-Limit der Organisation
  // durchsetzen, bevor ein weiterer Key angelegt wird. Phase 20: nutzt
  // createApiKeyIfUnderQuota() statt separatem countActiveApiKeys()+
  // createApiKey() - die alte Zwei-Schritt-Form hatte eine echte, waehrend
  // Phase 20 gefundene TOCTOU-Race (siehe Kommentar im Repository), die
  // gleichzeitige Erstellungsversuche das Plan-Limit umgehen liess.
  const organization = await getOrganizationById(organizationId);
  if (!organization) {
    throw notFoundError("Organisation nicht gefunden");
  }
  const limits = getPlanLimits(organization.plan);

  const plaintextKey = generateApiKeyPlaintext();
  const apiKey = await createApiKeyIfUnderQuota(
    {
      organizationId,
      description,
      ...(teamId !== undefined ? { teamId } : {}),
      ...(scopes !== undefined ? { scopes } : {}),
      ...(expiresAt !== undefined ? { expiresAt } : {}),
      ...(req.userId !== undefined ? { createdBy: req.userId } : {}),
    },
    hashApiKey(plaintextKey),
    apiKeyPrefix(plaintextKey),
    limits.maxApiKeys,
  );
  if (!apiKey) {
    throw new AppError(409, "CONFLICT", `Plan-Limit erreicht: maximal ${limits.maxApiKeys} aktive API-Keys fuer den Plan ${organization.plan}`);
  }

  broadcast(createEvent(RealtimeEventType.API_KEY_CREATED, apiKey));
  void dispatchWebhookEvent("API_KEY_CREATED", apiKey, apiKey.organizationId);
  void recordAuditLog({
    userId: req.userId!,
    action: "API_KEY_CREATED",
    category: "SYSTEM",
    message: `API Key "${apiKey.description}" erstellt`,
    metadata: { apiKeyId: apiKey.id, organizationId, teamId: teamId ?? null, scopes: apiKey.scopes },
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });

  // Der Klartext-Key wird genau einmal zurueckgegeben (analog zu Agent
  // Secrets, Phase 14) - danach ist nur noch der Hash gespeichert.
  res.status(201).json({ apiKey, plaintextKey });
});

async function resolveOrgIdForApiKey(req: Request): Promise<string | undefined> {
  const key = await getApiKeyById(req.params.id as string);
  return key?.organizationId;
}

apiKeysRouter.post("/api-keys/:id/revoke", authenticate, authorizeOrganizationRole(MANAGE_ROLES, resolveOrgIdForApiKey), async (req, res) => {
  const revoked = await revokeApiKey(req.params.id as string, req.userId!);
  if (!revoked) {
    throw notFoundError("API Key nicht gefunden oder bereits widerrufen");
  }
  const payload = { apiKeyId: revoked.id, organizationId: revoked.organizationId };
  broadcast(createEvent(RealtimeEventType.API_KEY_REVOKED, payload));
  void dispatchWebhookEvent("API_KEY_REVOKED", payload, payload.organizationId);
  void recordAuditLog({
    userId: req.userId!,
    action: "API_KEY_REVOKED",
    category: "SYSTEM",
    severity: "WARNING",
    message: `API Key "${revoked.description}" widerrufen`,
    metadata: { apiKeyId: revoked.id, organizationId: revoked.organizationId, actorUserId: req.userId },
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
  res.json(revoked);
});

// Auftragspunkt 8 "API-Key Management" ("Rotate") - neues Secret, gleiche
// id/description/scopes/team (siehe rotateApiKeyHash-Kommentar). Der alte
// Klartext-Key ist ab sofort ungueltig (naechster Hash-Lookup findet ihn
// nicht mehr).
apiKeysRouter.post(
  "/api-keys/:id/rotate",
  authenticate,
  credentialMintRateLimiter,
  authorizeOrganizationRole(MANAGE_ROLES, resolveOrgIdForApiKey),
  async (req, res) => {
    const plaintextKey = generateApiKeyPlaintext();
    const rotated = await rotateApiKeyHash(req.params.id as string, hashApiKey(plaintextKey), apiKeyPrefix(plaintextKey));
    if (!rotated) {
      throw notFoundError("API Key nicht gefunden oder bereits widerrufen");
    }

    broadcast(createEvent(RealtimeEventType.API_KEY_ROTATED, rotated));
    void dispatchWebhookEvent("API_KEY_ROTATED", rotated, rotated.organizationId);
    void recordAuditLog({
      userId: req.userId!,
      action: "API_KEY_ROTATED",
      category: "SYSTEM",
      severity: "WARNING",
      message: `API Key "${rotated.description}" rotiert`,
      metadata: { apiKeyId: rotated.id, organizationId: rotated.organizationId },
      ...(req.ip ? { ipAddress: req.ip } : {}),
    });

    // Der neue Klartext-Key wird genau einmal zurueckgegeben, wie bei der
    // Erstellung.
    res.json({ apiKey: rotated, plaintextKey });
  },
);
