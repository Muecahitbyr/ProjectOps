import { Router } from "express";
import { z } from "zod";
import { getPublicStatusHistory, getPublicStatusPage } from "../db/status-page.repository";
import { publicRateLimiter } from "../middleware/rate-limit";

// Phase 13 Teil 3 "Public Status Page" - bewusst OHNE authenticate/
// authorizeRole (siehe index.ts: dieser Router wird als einziger nicht
// hinter Login gemountet). Liefert ausschliesslich die stark reduzierten
// Public*-Typen (status-page.types.ts) - keine internen/User-/AI-/
// Automation-Daten koennen hier je austreten, weil status-page.repository.ts
// gar nicht auf diese Tabellen zugreift.
export const statusPageRouter = Router();

statusPageRouter.get("/status-page", publicRateLimiter, async (_req, res) => {
  res.json(await getPublicStatusPage());
});

const historyQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).catch(7),
});

statusPageRouter.get("/status-page/:projectId/history", publicRateLimiter, async (req, res) => {
  const parsed = historyQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Filter", details: parsed.error.flatten() });
    return;
  }
  res.json(await getPublicStatusHistory(req.params.projectId as string, parsed.data.days));
});
