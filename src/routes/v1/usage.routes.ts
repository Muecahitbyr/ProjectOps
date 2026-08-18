import { Router } from "express";
import { getApiUsageAnalytics } from "../../db/api-key-usage.repository";
import { authenticateApiKey, apiKeyRateLimiter, enforceApiQuota, requireApiScope, trackApiUsage } from "../../middleware/api-key-auth";

// Phase 16 (2. Iteration) Auftragspunkt 2 "Scopes" (READ_USAGE) - gibt dem
// "usage:read"-Scope einen echten, durchgesetzten Endpunkt: eine
// Organisation kann ihre EIGENE API-Nutzung selbst abfragen (reine
// Wiederverwendung von api-key-usage.repository.ts, keine neue SQL-Logik).
// Bewusst auf die eigene Organisation beschraenkt (context.organizationId),
// nicht global - ein API-Key darf nie die Nutzung fremder Organisationen
// sehen.
export const v1UsageRouter = Router();

v1UsageRouter.get(
  "/v1/usage/summary",
  authenticateApiKey,
  requireApiScope("usage:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const analytics = await getApiUsageAnalytics({ organizationId: context.organizationId, ...(context.teamId ? { teamId: context.teamId } : {}) });
    res.json({ data: analytics });
  },
);
