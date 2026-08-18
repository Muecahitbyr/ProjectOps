import { Router } from "express";
import { z } from "zod";
import { getAgentHeartbeatTimeline, getAgentPerformance, getMaintenanceImpact, getRegionAnalytics } from "../db/region-analytics.repository";
import { authenticate } from "../middleware/authenticate";

// Phase 13 Teil 14 "Analytics Erweiterung" - Lesezugriff fuer jeden
// authentifizierten Benutzer, analog zu /api/analytics/*.
export const regionAnalyticsRouter = Router();

const hoursQuerySchema = z.object({ hours: z.coerce.number().int().min(1).max(24 * 400).catch(24 * 30) });

regionAnalyticsRouter.get("/region-analytics/regions", authenticate, async (req, res) => {
  const parsed = hoursQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Filter", details: parsed.error.flatten() });
    return;
  }
  res.json(await getRegionAnalytics(parsed.data.hours));
});

regionAnalyticsRouter.get("/region-analytics/agent-performance", authenticate, async (req, res) => {
  const parsed = hoursQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Filter", details: parsed.error.flatten() });
    return;
  }
  res.json(await getAgentPerformance(parsed.data.hours));
});

regionAnalyticsRouter.get("/region-analytics/agents/:agentId/heartbeat-timeline", authenticate, async (req, res) => {
  const parsed = hoursQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Filter", details: parsed.error.flatten() });
    return;
  }
  res.json(await getAgentHeartbeatTimeline(req.params.agentId as string, parsed.data.hours));
});

const maintenanceImpactQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(100).catch(20) });

regionAnalyticsRouter.get("/region-analytics/maintenance-impact", authenticate, async (req, res) => {
  const parsed = maintenanceImpactQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Filter", details: parsed.error.flatten() });
    return;
  }
  res.json(await getMaintenanceImpact(parsed.data.limit));
});
