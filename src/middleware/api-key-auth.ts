import rateLimit from "express-rate-limit";
import type { NextFunction, Request, Response } from "express";
import { findApiKeyByHash, recordApiKeyUsage } from "../db/api-keys.repository";
import { getOrganizationById } from "../db/organizations.repository";
import {
  countOrganizationAutomationExecutionsToday,
  countOrganizationRequestsToday,
  recordApiUsage,
} from "../db/api-key-usage.repository";
import { notifyUsageUpdated } from "../core/api-usage-broadcast";
import { hashApiKey } from "../core/api-key-auth";
import { authRequiredError, forbiddenError } from "../core/app-error";
import { recordAuditLog } from "../core/audit-log";
import { dispatchWebhookEvent } from "../core/webhook-dispatch";
import { broadcast } from "../realtime/websocket.server";
import { createEvent, RealtimeEventType } from "../realtime/events";
import type { ApiQuotaEventPayload } from "../realtime/events";
import { getPlanLimits, QUOTA_WARNING_THRESHOLDS } from "../config/plan-limits";
import { isApiScope } from "../types/api-scope.types";
import type { ApiKeyAuthContext, ApiScope } from "../types/api-scope.types";

// Phase 16 "Echte API-Key-Authentifizierung" - eigene, von der Browser-
// Session (middleware/authenticate.ts, req.userId) strikt getrennte
// Identitaet fuer /api/v1. Ein API-Key authentifiziert eine Organisation
// (+ optional Team), niemals einen einzelnen Benutzer - req.userId bleibt
// bei API-Key-Requests bewusst ungesetzt.
// Vom Quota-Check bereits berechneter Stand (siehe enforceApiQuota unten) -
// GET /api/v1/health liest diesen Wert statt selbst erneut zu zaehlen, damit
// X-Quota-Remaining-Header und der Response-Body niemals auseinanderlaufen
// koennen (zwei unabhaengige COUNT(*)-Abfragen zu leicht unterschiedlichen
// Pipeline-Zeitpunkten koennten sonst minimal verschiedene Werte liefern).
export interface ApiQuotaStatus {
  requestsToday: number;
  dailyLimit: number;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      apiKeyContext?: ApiKeyAuthContext;
      apiQuotaStatus?: ApiQuotaStatus;
    }
  }
}

function requireApiKeyContext(req: Request): ApiKeyAuthContext {
  if (!req.apiKeyContext) {
    throw authRequiredError("Kein API-Key authentifiziert");
  }
  return req.apiKeyContext;
}

// Auftragspunkt 1 - Header "X-API-Key: <secret>" als primaeres Schema
// (siehe Auftrag), alternativ "Authorization: Bearer <secret>" fuer Clients,
// die bereits ein Bearer-Schema fuer andere APIs verwenden (z.B. generische
// OpenAPI-Tooling-Generatoren).
function extractApiKeySecret(req: Request): string | undefined {
  const headerKey = req.header("x-api-key");
  if (headerKey) return headerKey.trim();

  const authHeader = req.header("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim();
  }
  return undefined;
}

// Auftragspunkt 16 "Security": Fehlermeldungen bei fehlgeschlagener
// Authentifizierung sind bewusst IDENTISCH ("Ungueltiger oder fehlender
// API-Key"), egal ob der Header fehlt, der Hash nicht gefunden wurde, der
// Key widerrufen oder abgelaufen ist - so laesst sich von aussen nicht
// unterscheiden, ob ein Praefix "fast" gueltig war (keine Enumeration).
// Der GENAUE Grund landet trotzdem im Audit-Log (nur intern sichtbar).
const GENERIC_AUTH_ERROR = "Ungueltiger oder fehlender API-Key";

// Auftragspunkt 12 "Audit Logging" - eigene, unterscheidbare `action`-Werte
// pro Ablehnungsgrund ("API Key expired"/"revoked"/"Authentication
// failed" sind laut Auftrag drei separate Audit-Ereignisse), waehrend die
// HTTP-Antwort an den Client immer identisch bleibt (siehe
// GENERIC_AUTH_ERROR oben - keine Enumeration von aussen moeglich).
async function auditAuthFailure(action: string, reason: string, metadata: Record<string, unknown>, req: Request): Promise<void> {
  await recordAuditLog({
    action,
    category: "SYSTEM",
    severity: "WARNING",
    message: `API-Key-Authentifizierung fehlgeschlagen: ${reason}`,
    metadata,
    ...(req.ip ? { ipAddress: req.ip } : {}),
  });
}

// Auftragspunkt 1/4 "Authentifizierung"/"Tenant Isolation" - loest aus dem
// Secret den Organisations-/Team-Kontext auf. Muss vor jeder anderen
// /api/v1-Middleware laufen (siehe routes/v1/*.routes.ts).
export async function authenticateApiKey(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const secret = extractApiKeySecret(req);
  if (!secret) {
    await auditAuthFailure("API_KEY_AUTH_FAILED", "Kein X-API-Key/Authorization-Header", {}, req);
    throw authRequiredError(GENERIC_AUTH_ERROR);
  }

  const keyHash = hashApiKey(secret);
  const apiKey = await findApiKeyByHash(keyHash);
  if (!apiKey) {
    await auditAuthFailure("API_KEY_AUTH_FAILED", "Unbekannter Key-Hash", {}, req);
    throw authRequiredError(GENERIC_AUTH_ERROR);
  }

  if (apiKey.revokedAt) {
    await auditAuthFailure("API_KEY_AUTH_REJECTED_REVOKED", "Key widerrufen", { apiKeyId: apiKey.id, organizationId: apiKey.organizationId }, req);
    throw authRequiredError(GENERIC_AUTH_ERROR);
  }

  if (apiKey.expiresAt && new Date(apiKey.expiresAt).getTime() <= Date.now()) {
    await auditAuthFailure("API_KEY_AUTH_REJECTED_EXPIRED", "Key abgelaufen", { apiKeyId: apiKey.id, organizationId: apiKey.organizationId }, req);
    // Auftragspunkt 9 "Realtime" (API_KEY_EXPIRED) - ein echtes, JETZT
    // erkanntes Ereignis (kein Hintergrund-Sweep vorhanden, der Ablauf
    // "von selbst" entdeckt) - der Versuch, den abgelaufenen Key zu
    // nutzen, ist der Zeitpunkt, an dem der Ablauf ueberhaupt bemerkt wird.
    broadcast(createEvent(RealtimeEventType.API_KEY_EXPIRED, { apiKeyId: apiKey.id, organizationId: apiKey.organizationId }));
    throw authRequiredError(GENERIC_AUTH_ERROR);
  }

  const organization = await getOrganizationById(apiKey.organizationId);
  if (!organization || organization.status !== "ACTIVE") {
    await auditAuthFailure(
      "API_KEY_AUTH_FAILED",
      "Organisation nicht gefunden/inaktiv",
      { apiKeyId: apiKey.id, organizationId: apiKey.organizationId },
      req,
    );
    throw authRequiredError(GENERIC_AUTH_ERROR);
  }

  req.apiKeyContext = {
    authType: "api_key",
    apiKeyId: apiKey.id,
    organizationId: apiKey.organizationId,
    teamId: apiKey.teamId,
    scopes: apiKey.scopes.filter(isApiScope) as ApiScope[],
    plan: organization.plan,
    createdByUserId: apiKey.createdBy,
  };

  next();
}

// Auftragspunkt 2 "API-Key Scopes" - 403 bei gueltigem Key ohne den
// benoetigten Scope. Ein API-Key erbt NIEMALS automatisch alle Rechte
// (z.B. eines Organization Owner) - nur explizit beim Erstellen vergebene
// Scopes gelten.
export function requireApiScope(scope: ApiScope) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const context = requireApiKeyContext(req);
    if (!context.scopes.includes(scope)) {
      await recordAuditLog({
        action: "API_KEY_SCOPE_DENIED",
        category: "SYSTEM",
        severity: "WARNING",
        message: `API-Key ohne Scope "${scope}" abgelehnt`,
        metadata: { apiKeyId: context.apiKeyId, organizationId: context.organizationId, requiredScope: scope },
        ...(req.ip ? { ipAddress: req.ip } : {}),
      });
      throw forbiddenError(`Fehlender Scope: ${scope}`);
    }
    next();
  };
}

// Auftragspunkt 8 "Rate Limiting" - PRO API-Key (nicht pro IP, nicht pro
// Organisation), Limit haengt vom Organisationsplan ab (config/plan-
// limits.ts). express-rate-limit mit einem austauschbaren Store (Default:
// In-Memory) - fuer einen Mehrinstanz-Betrieb kann spaeter ein Redis-Store
// injiziert werden (siehe `store`-Option), ohne diese Middleware selbst
// aendern zu muessen. Bewusst NICHT der bestehende IP-basierte Limiter
// (middleware/rate-limit.ts) - eine andere Identitaetsachse (Key statt IP).
//
// Phase 17 Auftragspunkt 14 "Rate Limits" - drei Stufen (read/write/
// execute), je strenger je gefaehrlicher der Seiteneffekt. Eine
// gemeinsame Factory statt drei fast identischer Kopien.
type RateLimitTier = "read" | "write" | "execute";

function limitForTier(plan: ReturnType<typeof getPlanLimits>, tier: RateLimitTier): number {
  if (tier === "write") return plan.apiWriteRequestsPerMinute;
  if (tier === "execute") return plan.apiExecuteRequestsPerMinute;
  return plan.apiRequestsPerMinute;
}

function createApiKeyRateLimiter(tier: RateLimitTier) {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: (req: Request) => {
      const context = req.apiKeyContext;
      return context ? limitForTier(getPlanLimits(context.plan), tier) : 1;
    },
    // Eigener Key-Namespace pro Tier - ein Key hat fuer READ/WRITE/EXECUTE
    // unabhaengige Fenster, ein Burst auf einer Stufe zehrt die anderen
    // nicht auf.
    keyGenerator: (req: Request) => `${tier}:${req.apiKeyContext?.apiKeyId ?? "unknown"}`,
    standardHeaders: false,
    legacyHeaders: true,
    handler: async (req: Request, res: Response) => {
      const context = req.apiKeyContext;
      if (context) {
        await recordAuditLog({
          action: "API_KEY_RATE_LIMIT_EXCEEDED",
          category: "SYSTEM",
          severity: "WARNING",
          message: `API-Key-Rate-Limit ueberschritten (${tier})`,
          metadata: { apiKeyId: context.apiKeyId, organizationId: context.organizationId, tier },
          ...(req.ip ? { ipAddress: req.ip } : {}),
        });
      }
      res.status(429).json({ error: "Zu viele API-Anfragen - bitte spaeter erneut versuchen", code: "RATE_LIMITED" });
    },
  });
}

export const apiKeyRateLimiter = createApiKeyRateLimiter("read");
export const apiKeyWriteRateLimiter = createApiKeyRateLimiter("write");
export const apiKeyExecuteRateLimiter = createApiKeyRateLimiter("execute");

// Auftragspunkt 7/9/14 "API Quotas"/"Quota Headers"/"Usage Warning" - Tages-
// Quota PRO ORGANISATION (siehe api-key-usage.repository.ts). Setzt
// X-Quota-*-Header auf jeder erfolgreichen Antwort und loest bei 80%/90%/
//100% eine echte, aus dem tatsaechlichen Zaehlerstand abgeleitete Warnung
// aus (kein Fake-Alarm) - jede Schwelle feuert genau einmal, naemlich beim
// Request, der sie tatsaechlich ueberschreitet (Grenzwert-Vergleich vor/
// nach diesem Request statt eines zusaetzlichen "bereits gewarnt"-Zustands).
export async function enforceApiQuota(req: Request, res: Response, next: NextFunction): Promise<void> {
  const context = requireApiKeyContext(req);
  const limits = getPlanLimits(context.plan);
  const requestsBefore = await countOrganizationRequestsToday(context.organizationId);

  if (requestsBefore >= limits.apiRequestsPerDay) {
    await recordAuditLog({
      action: "API_QUOTA_EXCEEDED",
      category: "SYSTEM",
      severity: "WARNING",
      message: "API-Tagesquota ueberschritten",
      metadata: { apiKeyId: context.apiKeyId, organizationId: context.organizationId, requestsToday: requestsBefore, dailyLimit: limits.apiRequestsPerDay },
      ...(req.ip ? { ipAddress: req.ip } : {}),
    });
    await notifyQuotaThreshold(context, 100, requestsBefore, limits.apiRequestsPerDay);
    // Auftragspunkt 5 "Quotas" - eigener Code (QUOTA_EXCEEDED, siehe
    // core/app-error.ts) statt RATE_LIMITED wiederzuverwenden: andere
    // Ursache (Tages-Plan-Limit statt Missbrauchsschutz) und andere
    // Behebung (naechsten Tag warten/Plan upgraden statt kurz warten).
    // Retry-After = Sekunden bis zum naechsten UTC-Tageswechsel, an dem
    // die Quota real zurueckgesetzt wird (countOrganizationRequestsToday()
    // zaehlt ab date_trunc('day', now())).
    const secondsUntilMidnightUtc = Math.ceil((new Date(new Date().toISOString().slice(0, 10) + "T23:59:59.999Z").getTime() - Date.now()) / 1000) + 1;
    res.setHeader("Retry-After", String(Math.max(1, secondsUntilMidnightUtc)));
    res.status(429).json({
      error: "API-Tagesquota erreicht - bitte morgen erneut versuchen oder Plan upgraden",
      code: "QUOTA_EXCEEDED",
    });
    return;
  }

  const requestsAfter = requestsBefore + 1;
  const percentBefore = (requestsBefore / limits.apiRequestsPerDay) * 100;
  const percentAfter = (requestsAfter / limits.apiRequestsPerDay) * 100;
  for (const threshold of QUOTA_WARNING_THRESHOLDS) {
    if (threshold === 100) continue; // 100% = Blockierung oben, keine separate "Warnung" mehr noetig.
    if (percentBefore < threshold && percentAfter >= threshold) {
      await notifyQuotaThreshold(context, threshold, requestsAfter, limits.apiRequestsPerDay);
    }
  }

  res.setHeader("X-Quota-Limit", String(limits.apiRequestsPerDay));
  res.setHeader("X-Quota-Remaining", String(Math.max(0, limits.apiRequestsPerDay - requestsAfter)));
  req.apiQuotaStatus = { requestsToday: requestsAfter, dailyLimit: limits.apiRequestsPerDay };
  next();
}

// Auftragspunkt 15 "Quotas" - zusaetzliche, dedizierte Tages-Quota NUR fuer
// Automation-Ausfuehrungen (die gefaehrlichste Kategorie), on top der
// bereits durch enforceApiQuota() durchgesetzten allgemeinen Tages-Quota.
// Muss NACH enforceApiQuota() in der Kette stehen (siehe routes/v1/
// automation.routes.ts) - beide Grenzen muessen eingehalten werden.
export async function enforceAutomationExecutionQuota(req: Request, res: Response, next: NextFunction): Promise<void> {
  const context = requireApiKeyContext(req);
  const limits = getPlanLimits(context.plan);
  const executionsToday = await countOrganizationAutomationExecutionsToday(context.organizationId);

  if (executionsToday >= limits.automationExecutionsPerDay) {
    await recordAuditLog({
      action: "API_QUOTA_EXCEEDED",
      category: "SYSTEM",
      severity: "WARNING",
      message: "Automation-Execute-Tagesquota ueberschritten",
      metadata: {
        apiKeyId: context.apiKeyId,
        organizationId: context.organizationId,
        executionsToday,
        dailyLimit: limits.automationExecutionsPerDay,
      },
      ...(req.ip ? { ipAddress: req.ip } : {}),
    });
    const secondsUntilMidnightUtc = Math.ceil((new Date(new Date().toISOString().slice(0, 10) + "T23:59:59.999Z").getTime() - Date.now()) / 1000) + 1;
    res.setHeader("Retry-After", String(Math.max(1, secondsUntilMidnightUtc)));
    res.status(429).json({
      error: `Tages-Limit fuer Automation-Ausfuehrungen erreicht (${limits.automationExecutionsPerDay}/Tag)`,
      code: "QUOTA_EXCEEDED",
    });
    return;
  }

  next();
}

async function notifyQuotaThreshold(context: ApiKeyAuthContext, threshold: number, requestsToday: number, dailyLimit: number): Promise<void> {
  const payload: ApiQuotaEventPayload = {
    organizationId: context.organizationId,
    apiKeyId: context.apiKeyId,
    thresholdPercent: threshold,
    requestsToday,
    dailyLimit,
  };
  // Zwei getrennte Zweige statt eines ternaeren RealtimeEventType-Werts:
  // createEvent() ist ueberladen pro Literal-Typ (siehe realtime/events.ts)
  // und narrowt bei einem Union-Wert nicht korrekt (dasselbe Muster wie in
  // cluster-agents.routes.ts, Phase 14).
  if (threshold >= 100) {
    broadcast(createEvent(RealtimeEventType.API_QUOTA_EXCEEDED, payload));
    await dispatchWebhookEvent("API_QUOTA_EXCEEDED", payload, context.organizationId);
  } else {
    broadcast(createEvent(RealtimeEventType.API_QUOTA_WARNING, payload));
    await dispatchWebhookEvent("API_QUOTA_WARNING", payload, context.organizationId);
  }
}

// Auftragspunkt 5 "API-Key Usage Tracking" - letzter Schritt vor dem
// eigentlichen Route-Handler. Zeichnet Dauer/Statuscode ueber res.on(
// 'finish') auf, damit auch der ECHTE, vom Handler gesetzte Statuscode
// erfasst wird (nicht nur "Request kam durch"). Nur Requests, die
// Scope-/Rate-Limit-/Quota-Pruefung passiert haben, laufen hier durch -
// abgelehnte Versuche stehen bereits im Audit-Log (siehe oben).
// Phase 19 Auftragspunkt 1/3 "API Usage Analytics"/"Middleware Integration"
// - liest Content-Length-Header statt den Body erneut zu serialisieren
// (kein zusaetzlicher CPU-/Speicheraufwand pro Request). Fehlt der Header
// (z.B. bei chunked/gestreamten Antworten), wird null gespeichert statt
// eines erfundenen Werts.
function parseContentLength(value: string | number | undefined): number | null {
  if (value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function trackApiUsage(req: Request, res: Response, next: NextFunction): void {
  const context = requireApiKeyContext(req);
  const startedAt = Date.now();
  const requestSizeBytes = parseContentLength(req.header("content-length"));

  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    // Phase 17 Auftragspunkt 13 "Usage Tracking" - mutation wird rein aus
    // der HTTP-Methode abgeleitet (GET liest nie, POST/PATCH/DELETE
    // schreiben immer in dieser API) statt eines manuellen Flags pro
    // Route - kann nicht vergessen werden. req.idempotencyReplay wird von
    // middleware/idempotency.ts SYNCHRON gesetzt, bevor die Antwort
    // gesendet wird - zum Zeitpunkt dieses 'finish'-Events (danach) ist es
    // bereits zuverlaessig verfuegbar.
    //
    // Phase 19 Auftragspunkt 1/3 - createdByUserId kommt direkt aus dem
    // bereits beim Auth-Lookup geladenen Kontext (kein Zusatz-Query,
    // "Performance beachten"/"kein await blockiert Requests"). Dieser
    // gesamte Block laeuft weiterhin als Fire-and-Forget NACH res.on(
    // 'finish') - der Response ist zu diesem Zeitpunkt laengst beim Client.
    void recordApiUsage({
      apiKeyId: context.apiKeyId,
      organizationId: context.organizationId,
      endpoint: req.route?.path ? `${req.baseUrl}${req.route.path}` : req.path,
      method: req.method,
      statusCode: res.statusCode,
      durationMs,
      mutation: req.method !== "GET",
      idempotencyReplay: req.idempotencyReplay === true,
      createdByUserId: context.createdByUserId,
      requestSizeBytes,
      responseSizeBytes: parseContentLength(res.get("content-length")),
    });
    void recordApiKeyUsage(context.apiKeyId);
    void notifyUsageUpdated(context.organizationId);
  });

  next();
}
