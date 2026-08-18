import { Router } from "express";
import { getHistory } from "../db/results.repository";
import { authenticate } from "../middleware/authenticate";

export const checksRouter = Router();

checksRouter.get("/checks/:id/history", authenticate, async (req, res) => {
  const limit = Number(req.query.limit) || 50;
  res.json(await getHistory(req.params.id as string, limit));
});
