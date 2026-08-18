import { Router } from "express";
import { getHistory, getLatestResults, getStats } from "../db/results.repository";
import { authenticate } from "../middleware/authenticate";

export const resultsRouter = Router();

resultsRouter.get("/results", authenticate, async (_req, res) => {
  res.json(await getLatestResults());
});

resultsRouter.get("/results/:checkId", authenticate, async (req, res) => {
  res.json(await getHistory(req.params.checkId as string));
});

resultsRouter.get("/results/:checkId/stats", authenticate, async (req, res) => {
  const periodDays = Number(req.query.days) || 7;
  res.json(await getStats(req.params.checkId as string, periodDays));
});
