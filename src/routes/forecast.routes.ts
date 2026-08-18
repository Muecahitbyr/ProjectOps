import { Router } from "express";
import { z } from "zod";
import {
  getCapacityForecast,
  getDiskGrowthForecast,
  getFailureRateForecast,
  getHealthScoreForecast,
  getIncidentCountForecast,
  getResponseTimeForecast,
} from "../db/forecast.repository";
import { authenticate } from "../middleware/authenticate";
import type { ForecastMetric, ForecastResult } from "../types/forecast.types";

// Phase 13 Teil 10 "Predictive Analytics" - fuer die Analytics-Erweiterung
// (Forecast Charts, Prediction Accuracy). Lesezugriff fuer jeden
// authentifizierten Benutzer, analog zu /api/analytics/*.
export const forecastRouter = Router();

const querySchema = z.object({ projectId: z.string().trim().min(1).optional() });
const agentQuerySchema = z.object({ agentId: z.string().trim().min(1).optional() });

const METRIC_HANDLERS: Record<Exclude<ForecastMetric, "DISK_USAGE" | "CAPACITY">, (projectId?: string) => Promise<ForecastResult>> = {
  INCIDENT_COUNT: getIncidentCountForecast,
  FAILURE_RATE: getFailureRateForecast,
  RESPONSE_TIME: getResponseTimeForecast,
  HEALTH_SCORE: getHealthScoreForecast,
};

forecastRouter.get("/forecasts/:metric", authenticate, async (req, res) => {
  const metric = req.params.metric as string;

  if (metric === "DISK_USAGE" || metric === "CAPACITY") {
    const parsed = agentQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Ungueltige Filter", details: parsed.error.flatten() });
      return;
    }
    const handler = metric === "DISK_USAGE" ? getDiskGrowthForecast : getCapacityForecast;
    res.json(await handler(parsed.data.agentId));
    return;
  }

  if (!(metric in METRIC_HANDLERS)) {
    res.status(400).json({ error: "Unbekannte Forecast-Metrik" });
    return;
  }

  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Filter", details: parsed.error.flatten() });
    return;
  }

  const handler = METRIC_HANDLERS[metric as Exclude<ForecastMetric, "DISK_USAGE" | "CAPACITY">];
  res.json(await handler(parsed.data.projectId));
});
