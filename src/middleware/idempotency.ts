import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { claimIdempotencyKey, completeIdempotencyKey, getIdempotencyRecord } from "../db/api-idempotency.repository";
import { recordAuditLog } from "../core/audit-log";
import { AppError } from "../core/app-error";

// Phase 17 Auftragspunkt 3/4 "Idempotency Keys". Muss NACH Rate-Limit/
// Quota und NACH trackApiUsage (middleware/api-key-auth.ts) in der Kette
// stehen: trackApiUsage registriert seinen res.on('finish')-Listener
// bereits vorher, sodass auch ein Replay/Konflikt, der hier die Antwort
// sofort sendet, weiterhin als ein Usage-Eintrag gezaehlt wird (Auftrags-
// punkt 13: "Der HTTP Request darf weiterhin als API Usage gezaehlt
// werden"). req.idempotencyReplay wird synchron VOR dem Senden der
// Antwort gesetzt, trackApiUsage liest es beim spaeter feuernden
// 'finish'-Event.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      idempotencyReplay?: boolean;
    }
  }
}

function hashRequest(method: string, endpoint: string, body: unknown): string {
  const normalized = JSON.stringify({ method, endpoint, body: body ?? null });
  return createHash("sha256").update(normalized).digest("hex");
}

function wrapResJsonToCompleteRecord(res: Response, recordId: string): void {
  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    void completeIdempotencyKey(recordId, res.statusCode, body);
    return originalJson(body);
  }) as typeof res.json;
}

// Auftragspunkt 3 "Idempotency Keys" - Pflicht-Header fuer POST /v1/alerts
// und POST /v1/automation/actions/:id/execute (siehe dortige Router).
export function requireIdempotency() {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const context = req.apiKeyContext!;
    const idempotencyKey = req.header("idempotency-key");
    if (!idempotencyKey || idempotencyKey.trim().length === 0) {
      throw new AppError(400, "VALIDATION_ERROR", "Idempotency-Key-Header ist fuer diese Aktion erforderlich");
    }

    const endpoint = req.route?.path ? `${req.baseUrl}${req.route.path}` : req.path;
    const requestHash = hashRequest(req.method, endpoint, req.body);

    const claimed = await claimIdempotencyKey({
      organizationId: context.organizationId,
      apiKeyId: context.apiKeyId,
      idempotencyKey,
      requestHash,
      endpoint,
      method: req.method,
    });

    if (claimed) {
      // Neuer Key - dieser Request ist der "echte" erste Versuch. Der
      // Response-Body wird abgefangen und persistiert, sobald der
      // Route-Handler (oder der globale error-handler bei einem Fehler)
      // res.json() aufruft.
      wrapResJsonToCompleteRecord(res, claimed.id);
      next();
      return;
    }

    const existing = await getIdempotencyRecord(context.organizationId, context.apiKeyId, idempotencyKey);
    if (!existing) {
      // Extrem unwahrscheinlicher Race (Zeile wurde zwischen dem
      // fehlgeschlagenen Claim und dieser Abfrage geloescht) - als
      // voruebergehenden Konflikt behandeln, ein erneuter Versuch mit
      // demselben Key loest den Claim dann normal aus.
      throw new AppError(409, "CONFLICT", "Idempotency-Konflikt - bitte erneut versuchen");
    }

    if (existing.requestHash !== requestHash) {
      await recordAuditLog({
        action: "API_IDEMPOTENCY_CONFLICT",
        category: "SYSTEM",
        severity: "WARNING",
        message: "Idempotency-Key mit abweichendem Request-Payload wiederverwendet",
        metadata: { apiKeyId: context.apiKeyId, organizationId: context.organizationId, idempotencyKey, endpoint },
        ...(req.ip ? { ipAddress: req.ip } : {}),
      });
      throw new AppError(409, "IDEMPOTENCY_KEY_REUSED", "Dieser Idempotency-Key wurde bereits mit einem anderen Request-Body verwendet");
    }

    if (existing.status === "IN_PROGRESS") {
      throw new AppError(409, "CONFLICT", "Dieser Request wird bereits verarbeitet - bitte kurz warten");
    }

    // COMPLETED + gleicher Hash -> echter Replay: exakt dieselbe Antwort,
    // kein zweiter Aufruf des Route-Handlers, also kein zweiter
    // Business-Write.
    req.idempotencyReplay = true;
    await recordAuditLog({
      action: "API_IDEMPOTENCY_REPLAY",
      category: "SYSTEM",
      message: "Idempotency-Key erneut verwendet - identische Antwort ausgeliefert, kein erneuter Write",
      metadata: { apiKeyId: context.apiKeyId, organizationId: context.organizationId, idempotencyKey, endpoint },
      ...(req.ip ? { ipAddress: req.ip } : {}),
    });
    res.status(existing.responseStatus ?? 200).json(existing.responseBody);
  };
}
