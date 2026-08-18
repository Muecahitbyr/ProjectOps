import { Router } from "express";
import { z } from "zod";
import {
  countApiKeys,
  createApiKeyIfUnderQuota,
  getApiKeyById,
  listApiKeys,
  revokeApiKey,
  rotateApiKeyHash,
} from "../../db/api-keys.repository";
import { getOrganizationById } from "../../db/organizations.repository";
import { getTeamById } from "../../db/teams.repository";
import { apiKeyPrefix, generateApiKeyPlaintext, hashApiKey } from "../../core/api-key-auth";
import {
  authenticateApiKey,
  apiKeyRateLimiter,
  apiKeyWriteRateLimiter,
  enforceApiQuota,
  requireApiScope,
  trackApiUsage,
} from "../../middleware/api-key-auth";
import { requireIdempotency } from "../../middleware/idempotency";
import { getPlanLimits } from "../../config/plan-limits";
import { API_SCOPES, isApiScope } from "../../types/api-scope.types";
import { paginatedResponse, parsePagination, toApiKeyDto } from "./shared";
import { AppError, notFoundError } from "../../core/app-error";
import { recordAuditLog } from "../../core/audit-log";
import { dispatchWebhookEvent } from "../../core/webhook-dispatch";
import { broadcast } from "../../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../../realtime/events";

// Phase 20 "Enterprise API Governance, Developer Portal & Credential
// Lifecycle" Auftragspunkt 13 "Externe API" - VOR der Implementierung
// geprueft: es existierte noch KEIN externer /api/v1/api-keys-Endpunkt
// (routes/v1/ hatte keine api-keys.routes.ts) - kein Duplikat, echte
// Luecke. Nutzt exakt dieselbe Repository-/Hashing-/Rotations-Logik wie die
// bestehende interne, session-authentifizierte Route (routes/api-keys.
// routes.ts) - keine zweite Implementierung von Create/Rotate/Revoke, nur
// ein zweiter, API-Key-authentifizierter Einstiegspunkt darauf.
//
// KRITISCHE Sicherheitsregel, die es in der internen Route (menschliche
// Organisations-Rolle) so nicht braucht: ein externer API-Key darf beim
// Erstellen eines NEUEN Keys niemals Scopes vergeben, die er selbst nicht
// besitzt - sonst koennte ein Key mit nur "api-key-management:write" einen
// maechtigeren Geschwister-Key (z.B. mit automation:write) erzeugen und so
// seine eigenen Rechte effektiv erweitern (Privilege Escalation). Siehe
// assertScopesAreSubset() unten.
export const v1ApiKeysRouter = Router();

function assertScopesAreSubset(requested: string[], allowed: string[]): void {
  const allowedSet = new Set(allowed);
  const disallowed = requested.filter((scope) => !allowedSet.has(scope));
  if (disallowed.length > 0) {
    throw new AppError(
      403,
      "FORBIDDEN",
      `Dieser API-Key kann keine Keys mit Scopes erstellen, die er selbst nicht besitzt: ${disallowed.join(", ")}`,
    );
  }
}

// Tenant Isolation (Auftragspunkt 14) - 404 (nicht 403) fuer einen Key aus
// einer fremden Organisation oder (bei team-gebundenem aufrufendem Key)
// einem fremden Team, konsistent mit allen /api/v1-Endpunkten seit Phase 17.
async function loadOwnKeyOr404(id: string, organizationId: string, callerTeamId: string | null) {
  const target = await getApiKeyById(id);
  if (!target || target.organizationId !== organizationId || (callerTeamId && target.teamId !== callerTeamId)) {
    throw notFoundError("API-Key nicht gefunden");
  }
  return target;
}

v1ApiKeysRouter.get(
  "/v1/api-keys",
  authenticateApiKey,
  requireApiScope("api-key-management:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const pagination = parsePagination(req);
    const filter = { organizationId: context.organizationId, ...(context.teamId ? { teamId: context.teamId } : {}) };
    const [keys, total] = await Promise.all([
      listApiKeys({ ...filter, limit: pagination.pageSize, offset: pagination.offset }),
      countApiKeys(filter),
    ]);
    res.json(paginatedResponse(keys.map(toApiKeyDto), pagination, total));
  },
);

v1ApiKeysRouter.get(
  "/v1/api-keys/:id",
  authenticateApiKey,
  requireApiScope("api-key-management:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const target = await loadOwnKeyOr404(req.params.id as string, context.organizationId, context.teamId);
    res.json({ data: toApiKeyDto(target) });
  },
);

// .strict() lehnt unbekannte Felder ab (Mass-Assignment-Schutz,
// Auftragspunkt 16) - insbesondere organizationId/createdBy/revokedBy/id/
// keyHash sind schlicht NICHT Teil des Schemas. organizationId/teamId
// kommen ausschliesslich aus dem authentifizierten API-Key-Kontext.
const createSchema = z
  .object({
    description: z.string().trim().min(1).max(200),
    scopes: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
    teamId: z.string().trim().min(1).optional(),
    expiresAt: z.string().trim().min(1).optional(),
  })
  .strict();

v1ApiKeysRouter.post(
  "/v1/api-keys",
  authenticateApiKey,
  requireApiScope("api-key-management:write"),
  apiKeyWriteRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  requireIdempotency(),
  async (req, res) => {
    const context = req.apiKeyContext!;
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Ungueltige Eingabe", code: "VALIDATION_ERROR", details: parsed.error.flatten() });
      return;
    }
    const { description, scopes, teamId, expiresAt } = parsed.data;

    const invalidScopes = (scopes ?? []).filter((scope) => !isApiScope(scope));
    if (invalidScopes.length > 0) {
      throw new AppError(400, "VALIDATION_ERROR", `Unbekannte Scopes: ${invalidScopes.join(", ")}`, { validScopes: API_SCOPES });
    }
    // Privilege-Escalation-Schutz - siehe Kommentar am Dateianfang.
    assertScopesAreSubset(scopes ?? [], context.scopes);

    // Ein team-gebundener aufrufender Key darf nur Keys FUER SEIN EIGENES
    // Team erstellen (nicht organisationsweit, nicht fuer ein fremdes Team)
    // - dieselbe Team-Scoping-Grenze wie bei automation-rules (Phase 18).
    if (context.teamId) {
      if (teamId && teamId !== context.teamId) {
        throw notFoundError("Team nicht gefunden oder gehoert nicht zu dieser Organisation");
      }
    } else if (teamId) {
      const team = await getTeamById(teamId);
      if (!team || team.organizationId !== context.organizationId) {
        throw notFoundError("Team nicht gefunden oder gehoert nicht zu dieser Organisation");
      }
    }
    const effectiveTeamId = teamId ?? context.teamId ?? undefined;

    // Auftragspunkt 5/15/18 "Governance"/"Rate Limit-Quota-Interaction"/
    // "Race Smoke Test" - createApiKeyIfUnderQuota() haelt COUNT+INSERT in
    // EINER Transaktion mit Zeilensperre atomar (siehe Repository-Kommentar)
    // - ein waehrend der Live-E2E-Tests dieser Phase gefundener echter
    // TOCTOU-Bug (5 gleichzeitige Requests bei 2 freien Slots erzeugten
    // vorher 5 neue Keys statt 2) ist damit sowohl hier als auch in der
    // internen Route (routes/api-keys.routes.ts) behoben - keine zweite
    // Quota-Implementierung, dieselbe Funktion.
    const organization = await getOrganizationById(context.organizationId);
    if (!organization) {
      throw notFoundError("Organisation nicht gefunden");
    }
    const limits = getPlanLimits(organization.plan);

    const plaintextKey = generateApiKeyPlaintext();
    const apiKey = await createApiKeyIfUnderQuota(
      {
        organizationId: context.organizationId,
        description,
        ...(effectiveTeamId !== undefined ? { teamId: effectiveTeamId } : {}),
        ...(scopes !== undefined ? { scopes } : {}),
        ...(expiresAt !== undefined ? { expiresAt } : {}),
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
      action: "API_KEY_CREATED",
      category: "SYSTEM",
      message: `API Key "${apiKey.description}" ueber die externe API erstellt`,
      metadata: { apiKeyId: apiKey.id, organizationId: apiKey.organizationId, teamId: apiKey.teamId, actorApiKeyId: context.apiKeyId },
      ...(req.ip ? { ipAddress: req.ip } : {}),
    });

    // Auftragspunkt 3/8 "Rotation"/"Create API Key Dialog" - der
    // Klartext-Key wird genau EINMAL zurueckgegeben, exakt wie bei der
    // internen Route. Niemals spaeter aus der DB rekonstruierbar (nur der
    // Hash wird gespeichert).
    res.status(201).json({ data: toApiKeyDto(apiKey), plaintextKey });
  },
);

v1ApiKeysRouter.post(
  "/v1/api-keys/:id/rotate",
  authenticateApiKey,
  requireApiScope("api-key-management:write"),
  apiKeyWriteRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  requireIdempotency(),
  async (req, res) => {
    const context = req.apiKeyContext!;
    await loadOwnKeyOr404(req.params.id as string, context.organizationId, context.teamId);

    const plaintextKey = generateApiKeyPlaintext();
    const rotated = await rotateApiKeyHash(req.params.id as string, hashApiKey(plaintextKey), apiKeyPrefix(plaintextKey));
    if (!rotated) {
      throw notFoundError("API-Key nicht gefunden oder bereits widerrufen");
    }

    broadcast(createEvent(RealtimeEventType.API_KEY_ROTATED, rotated));
    void dispatchWebhookEvent("API_KEY_ROTATED", rotated, rotated.organizationId);
    void recordAuditLog({
      action: "API_KEY_ROTATED",
      category: "SYSTEM",
      severity: "WARNING",
      message: `API Key "${rotated.description}" ueber die externe API rotiert`,
      metadata: { apiKeyId: rotated.id, organizationId: rotated.organizationId, teamId: rotated.teamId, actorApiKeyId: context.apiKeyId },
      ...(req.ip ? { ipAddress: req.ip } : {}),
    });

    res.json({ data: toApiKeyDto(rotated), plaintextKey });
  },
);

v1ApiKeysRouter.post(
  "/v1/api-keys/:id/revoke",
  authenticateApiKey,
  requireApiScope("api-key-management:write"),
  apiKeyWriteRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    await loadOwnKeyOr404(req.params.id as string, context.organizationId, context.teamId);

    // revokedBy bleibt null - der Akteur ist ein API-Key, keine
    // Benutzer-Identitaet (siehe revokeApiKey()-Kommentar im Repository).
    const revoked = await revokeApiKey(req.params.id as string);
    if (!revoked) {
      throw notFoundError("API-Key nicht gefunden oder bereits widerrufen");
    }

    const payload = { apiKeyId: revoked.id, organizationId: revoked.organizationId };
    broadcast(createEvent(RealtimeEventType.API_KEY_REVOKED, payload));
    void dispatchWebhookEvent("API_KEY_REVOKED", payload, payload.organizationId);
    void recordAuditLog({
      action: "API_KEY_REVOKED",
      category: "SYSTEM",
      severity: "WARNING",
      message: `API Key "${revoked.description}" ueber die externe API widerrufen`,
      metadata: { apiKeyId: revoked.id, organizationId: revoked.organizationId, teamId: revoked.teamId, actorApiKeyId: context.apiKeyId },
      ...(req.ip ? { ipAddress: req.ip } : {}),
    });

    res.json({ data: toApiKeyDto(revoked) });
  },
);
