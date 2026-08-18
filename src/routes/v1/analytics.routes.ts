import { Router } from "express";
import { z } from "zod";
import { getTenantAnalytics } from "../../db/tenant-analytics.repository";
import { getApiUsageAnalytics, getApiUsageTimeseries } from "../../db/api-key-usage.repository";
import { getApiKeyById } from "../../db/api-keys.repository";
import { authenticateApiKey, apiKeyRateLimiter, enforceApiQuota, requireApiScope, trackApiUsage } from "../../middleware/api-key-auth";
import { notFoundError } from "../../core/app-error";

// Phase 16 Auftragspunkt 3 "Echte externe API" - wiederverwendet
// getTenantAnalytics() (Phase 15, tenant-analytics.repository.ts) 1:1: die
// Funktion ist bereits ausschliesslich durch organizationId (+ optional
// teamId) parametrisiert, also von Natur aus tenant-sicher - keine neue
// Analytics-SQL noetig (Auftragspunkt 3: "Keine Duplizierung der
// SQL-Logik").
export const v1AnalyticsRouter = Router();

const querySchema = z.object({
  hours: z.coerce.number().int().min(1).max(24 * 400).optional(),
});

v1AnalyticsRouter.get(
  "/v1/analytics/summary",
  authenticateApiKey,
  requireApiScope("analytics:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Ungueltige Filter", code: "VALIDATION_ERROR", details: parsed.error.flatten() });
      return;
    }

    const analytics = await getTenantAnalytics(context.organizationId, parsed.data.hours ?? 24 * 30, context.teamId ?? undefined);
    if (!analytics) {
      throw notFoundError("Organisation nicht gefunden");
    }
    res.json({ data: analytics });
  },
);

// Phase 19 Auftragspunkt 2 "Analytics Dashboard API" - alle drei Endpunkte
// nutzen bewusst den bestehenden "usage:read"-Scope (Phase 16, bereits
// durchgesetzt fuer GET /v1/usage/summary) statt eines neuen Scopes: es ist
// dieselbe Kategorie ("wie wird diese Organisation ueber die API genutzt"),
// nur mit mehr Detailtiefe (Zeitreihe, einzelner Key) - ein zweiter Scope
// fuer dieselbe Berechtigungsfrage waere unnoetige Fragmentierung.
v1AnalyticsRouter.get(
  "/v1/analytics/api/overview",
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

const timeseriesQuerySchema = z.object({
  hours: z.coerce.number().int().min(1).max(24 * 30).optional(),
  granularity: z.enum(["hour", "day"]).optional(),
});

v1AnalyticsRouter.get(
  "/v1/analytics/api/timeseries",
  authenticateApiKey,
  requireApiScope("usage:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const parsed = timeseriesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Ungueltige Filter", code: "VALIDATION_ERROR", details: parsed.error.flatten() });
      return;
    }

    const hours = parsed.data.hours ?? 24;
    const granularity = parsed.data.granularity ?? "hour";
    const buckets = await getApiUsageTimeseries(
      { organizationId: context.organizationId, ...(context.teamId ? { teamId: context.teamId } : {}) },
      hours,
      granularity,
    );
    res.json({ data: buckets });
  },
);

v1AnalyticsRouter.get(
  "/v1/analytics/api/keys/:id",
  authenticateApiKey,
  requireApiScope("usage:read"),
  apiKeyRateLimiter,
  enforceApiQuota,
  trackApiUsage,
  async (req, res) => {
    const context = req.apiKeyContext!;
    const targetKey = await getApiKeyById(req.params.id as string);
    // Auftragspunkt 6 "Security" - 404 (nicht 403) fuer einen Key aus einer
    // fremden Organisation oder (bei team-gebundenem aufrufendem Key) einem
    // fremden Team, konsistent mit allen anderen /api/v1-Endpunkten (kein
    // IDOR/Enumeration).
    if (!targetKey || targetKey.organizationId !== context.organizationId || (context.teamId && targetKey.teamId !== context.teamId)) {
      throw notFoundError("API-Key nicht gefunden");
    }

    const analytics = await getApiUsageAnalytics({ apiKeyId: targetKey.id });
    res.json({
      data: {
        apiKey: {
          id: targetKey.id,
          description: targetKey.description,
          keyPrefix: targetKey.keyPrefix,
          teamId: targetKey.teamId,
          scopes: targetKey.scopes,
          expiresAt: targetKey.expiresAt,
          lastUsedAt: targetKey.lastUsedAt,
          revokedAt: targetKey.revokedAt,
          createdAt: targetKey.createdAt,
        },
        usage: analytics,
      },
    });
  },
);
