import { Router } from "express";
import { z } from "zod";
import { getPlatformOverview } from "../db/platform.repository";
import { getTenantAnalytics, listTenantAnalyticsForAllOrganizations } from "../db/tenant-analytics.repository";
import { getTeamById } from "../db/teams.repository";
import { getApiUsageAnalytics, getApiUsageTimeseries } from "../db/api-key-usage.repository";
import { countActiveApiKeys, getApiKeyById } from "../db/api-keys.repository";
import { getOrganizationById } from "../db/organizations.repository";
import { getPlanLimits } from "../config/plan-limits";
import { authenticate } from "../middleware/authenticate";
import { authorizePlatformOwner } from "../middleware/authorize";
import { notFoundError } from "../core/app-error";

// Phase 15 Teil 9 "Global Administration" - Platform Owner-only (mit
// Fallback auf bestehendes authorizeGlobalAdmin(), siehe
// middleware/authorize.ts). "Global Audit" nutzt bewusst den bestehenden
// GET /api/audit-log (Phase 13) weiter statt eines Duplikats.
export const platformRouter = Router();

platformRouter.get("/platform", authenticate, authorizePlatformOwner(), async (_req, res) => {
  res.json(await getPlatformOverview());
});

const analyticsQuerySchema = z.object({
  organizationId: z.string().trim().min(1).optional(),
  // Teil 8 "Tenant Analytics" - "filterbar nach Organisation und Team".
  // Ein Team gehoert immer zu genau einer Organisation (teams.organization_id,
  // Migration 0033), daher wird organizationId bei reinem teamId-Filter
  // unten automatisch aus dem Team aufgeloest statt einen zweiten,
  // widerspruechlichen Parameter zu verlangen.
  teamId: z.string().trim().min(1).optional(),
  hours: z.coerce.number().int().min(1).max(24 * 400).catch(24 * 30),
});

platformRouter.get("/platform/analytics", authenticate, authorizePlatformOwner(), async (req, res) => {
  const parsed = analyticsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Filter", details: parsed.error.flatten() });
    return;
  }

  let organizationId = parsed.data.organizationId;
  if (parsed.data.teamId) {
    const team = await getTeamById(parsed.data.teamId);
    if (!team) {
      throw notFoundError("Team nicht gefunden");
    }
    organizationId = team.organizationId;
  }

  if (organizationId) {
    const analytics = await getTenantAnalytics(organizationId, parsed.data.hours, parsed.data.teamId);
    if (!analytics) {
      throw notFoundError("Organisation nicht gefunden");
    }
    res.json([analytics]);
    return;
  }
  res.json(await listTenantAnalyticsForAllOrganizations(parsed.data.hours));
});

const usageQuerySchema = z.object({
  organizationId: z.string().trim().min(1).optional(),
});

// Phase 16 Auftragspunkt 6 "Usage Analytics" - erweitert die bestehende
// Platform-Usage-Antwort (Phase 15) um die echten, aus api_key_usage
// aggregierten Werte (Auftragspunkt 5/6). apiUsageCount/totalApiUsageCount
// (ueber getPlatformOverview(), Summe von api_keys.usage_count) liefern ab
// jetzt reale Zahlen, da /api/v1 recordApiKeyUsage() tatsaechlich aufruft
// (siehe middleware/api-key-auth.ts) - vorher blieb dieser Wert immer 0
// (Phase-15-Abschlussbericht, bekannte Einschraenkung Nr. 1).
platformRouter.get("/platform/usage", authenticate, authorizePlatformOwner(), async (req, res) => {
  const parsed = usageQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Filter", details: parsed.error.flatten() });
    return;
  }

  const [overview, apiUsage] = await Promise.all([
    getPlatformOverview(),
    getApiUsageAnalytics(parsed.data.organizationId ? { organizationId: parsed.data.organizationId } : {}),
  ]);
  res.json({
    totalApiUsageCount: overview.totalApiUsageCount,
    apiKeyCount: overview.apiKeyCount,
    serviceAccountCount: overview.serviceAccountCount,
    pendingWebhookDeliveries: overview.pendingWebhookDeliveries,
    deadLetterWebhookDeliveries: overview.deadLetterWebhookDeliveries,
    ...apiUsage,
  });
});

// Phase 19 "Enterprise Observability, API Analytics & Operational
// Intelligence" - interne, Platform-Owner-only Spiegelseite der externen
// /api/v1/analytics/api/*-Endpunkte (routes/v1/analytics.routes.ts) fuer
// die neue Frontend-Seite /platform/api-analytics: dieselben Repository-
// Funktionen, nur session- statt API-Key-authentifiziert (die Browser-SPA
// besitzt keinen API-Key). Kein Duplikat der Aggregations-SQL - exakt
// dasselbe Muster wie /platform/usage (intern) neben /v1/usage/summary
// (extern), beide bereits seit Phase 16 nebeneinander bestehend.
const apiAnalyticsQuerySchema = z.object({
  organizationId: z.string().trim().min(1).optional(),
});

platformRouter.get("/platform/api-analytics/overview", authenticate, authorizePlatformOwner(), async (req, res) => {
  const parsed = apiAnalyticsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Filter", details: parsed.error.flatten() });
    return;
  }

  const organizationId = parsed.data.organizationId;
  const [analytics, activeApiKeysCount] = await Promise.all([
    getApiUsageAnalytics(organizationId ? { organizationId } : {}),
    organizationId ? countActiveApiKeys(organizationId) : getPlatformOverview().then((overview) => overview.apiKeyCount),
  ]);
  res.json({ ...analytics, activeApiKeysCount });
});

const apiAnalyticsTimeseriesQuerySchema = z.object({
  organizationId: z.string().trim().min(1).optional(),
  hours: z.coerce.number().int().min(1).max(24 * 30).optional(),
  granularity: z.enum(["hour", "day"]).optional(),
});

platformRouter.get("/platform/api-analytics/timeseries", authenticate, authorizePlatformOwner(), async (req, res) => {
  const parsed = apiAnalyticsTimeseriesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Filter", details: parsed.error.flatten() });
    return;
  }

  const buckets = await getApiUsageTimeseries(
    parsed.data.organizationId ? { organizationId: parsed.data.organizationId } : {},
    parsed.data.hours ?? 24,
    parsed.data.granularity ?? "hour",
  );
  res.json({ data: buckets });
});

platformRouter.get("/platform/api-analytics/keys/:id", authenticate, authorizePlatformOwner(), async (req, res) => {
  const targetKey = await getApiKeyById(req.params.id as string);
  if (!targetKey) {
    throw notFoundError("API-Key nicht gefunden");
  }

  const analytics = await getApiUsageAnalytics({ apiKeyId: targetKey.id });
  res.json({ apiKey: targetKey, usage: analytics });
});

// Phase 20 Auftragspunkt 7 "Developer Portal" (Abschnitt A "API Overview" -
// "aktuelle Rate Limits"/"aktuelle Quotas") - reine Weitergabe der
// bestehenden, rein synchronen getPlanLimits()-Konfiguration (config/
// plan-limits.ts, dieselbe Quelle, die middleware/api-key-auth.ts fuer die
// tatsaechliche Durchsetzung nutzt) fuer eine gewaehlte Organisation. Keine
// zweite Limits-Tabelle/-Konfiguration - nur ein duenner Lesezugriff, den
// es fuer den Browser bisher nicht gab (die Werte waren bislang nur ueber
// die externe GET /api/v1/health-Antwort eines bereits vorhandenen API-Keys
// sichtbar).
const planLimitsQuerySchema = z.object({
  organizationId: z.string().trim().min(1),
});

platformRouter.get("/platform/plan-limits", authenticate, authorizePlatformOwner(), async (req, res) => {
  const parsed = planLimitsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Filter", details: parsed.error.flatten() });
    return;
  }
  const organization = await getOrganizationById(parsed.data.organizationId);
  if (!organization) {
    throw notFoundError("Organisation nicht gefunden");
  }
  res.json({ plan: organization.plan, limits: getPlanLimits(organization.plan) });
});
