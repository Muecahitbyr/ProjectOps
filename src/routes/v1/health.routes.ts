import { Router } from "express";
import { authenticateApiKey, apiKeyRateLimiter, enforceApiQuota, trackApiUsage } from "../../middleware/api-key-auth";
import { getPlanLimits } from "../../config/plan-limits";

// Phase 16 Auftragspunkt 3 "Echte externe API" - kein Scope noetig (kein
// Zugriff auf Geschaeftsdaten), aber trotzdem ein gueltiger, nicht
// widerrufener/abgelaufener API-Key noetig: dient API-Konsumenten als
// einfachster Weg, einen Key zu verifizieren und den eigenen
// Plan/Quota-Stand abzufragen, ohne eine echte Ressource abzufragen.
// Durchlaeuft bewusst denselben Rate-Limit-/Quota-Pfad wie alle anderen
// v1-Endpunkte (keine Sonderbehandlung, die zum Quota-Bypass missbraucht
// werden koennte).
export const v1HealthRouter = Router();

v1HealthRouter.get("/v1/health", authenticateApiKey, apiKeyRateLimiter, enforceApiQuota, trackApiUsage, async (req, res) => {
  const context = req.apiKeyContext!;
  const limits = getPlanLimits(context.plan);
  // req.apiQuotaStatus stammt aus enforceApiQuota() (derselbe Request) -
  // eine zweite, unabhaengige COUNT(*)-Abfrage hier wuerde einen leicht
  // anderen Wert liefern koennen (Race mit der eigenen Zustellung, siehe
  // middleware/api-key-auth.ts) und so X-Quota-Remaining-Header und
  // Response-Body widerspruechlich machen.
  const quotaStatus = req.apiQuotaStatus!;

  res.json({
    status: "ok",
    apiKeyId: context.apiKeyId,
    organizationId: context.organizationId,
    teamId: context.teamId,
    plan: context.plan,
    scopes: context.scopes,
    quota: {
      requestsToday: quotaStatus.requestsToday,
      dailyLimit: quotaStatus.dailyLimit,
      remaining: Math.max(0, quotaStatus.dailyLimit - quotaStatus.requestsToday),
    },
    rateLimit: {
      requestsPerMinute: limits.apiRequestsPerMinute,
    },
  });
});
