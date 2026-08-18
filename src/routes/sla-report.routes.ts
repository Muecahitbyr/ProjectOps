import { Router } from "express";
import { z } from "zod";
import { getSlaReport } from "../db/sla-report.repository";
import { authenticate } from "../middleware/authenticate";
import { notFoundError } from "../core/app-error";

// Phase 13 Teil 6 "SLA Reports" - Export (PDF/Excel/CSV/JSON) passiert im
// Frontend ueber das bestehende utils/export.ts (siehe Analytics-Seite),
// dieser Endpunkt liefert nur die Rohdaten. Lesezugriff wie /api/analytics/*.
export const slaReportRouter = Router();

const querySchema = z.object({ hours: z.coerce.number().int().min(1).max(24 * 400).catch(24 * 30) });

slaReportRouter.get("/sla-report/:projectId", authenticate, async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Filter", details: parsed.error.flatten() });
    return;
  }

  const report = await getSlaReport(req.params.projectId as string, parsed.data.hours);
  if (!report) {
    throw notFoundError("Projekt nicht gefunden");
  }
  res.json(report);
});
