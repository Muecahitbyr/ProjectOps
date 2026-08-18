import { Router } from "express";
import { z } from "zod";
import { listAlertEvents } from "../db/alert-events.repository";
import { authenticate } from "../middleware/authenticate";

export const alertEventsRouter = Router();

const querySchema = z.object({
  projectId: z.string().trim().min(1).optional(),
  severity: z.enum(["INFO", "WARNING", "HIGH", "CRITICAL"]).optional(),
  status: z.enum(["TRIGGERED", "RESOLVED", "SUPPRESSED"]).optional(),
  from: z.string().trim().min(1).optional(),
  to: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).catch(50),
  offset: z.coerce.number().int().min(0).catch(0),
});

// Auftragspunkt 3 "Alert History" (/alerts/history im Frontend) - liest die
// deduplizierte Episoden-Historie aus alert_events (Auftragspunkt 4).
// Phase 65 "Enterprise Platform Consolidation & Final Gap Analysis" - live
// gefundener Bug: authenticate war importiert, aber nie in die Route
// eingehaengt - dieser Endpunkt war dadurch ohne Login erreichbar, anders
// als jede andere Route dieses "Shared Ops Console"-Tiers (z.B.
// alerts.routes.ts/diagnostic-snapshots.routes.ts), die alle mindestens
// authenticate verlangen. Dieselbe authenticate-only-Konvention wie dort.
alertEventsRouter.get("/alert-events", authenticate, async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Filter", details: parsed.error.flatten() });
    return;
  }

  const { projectId, severity, status, from, to, limit, offset } = parsed.data;
  res.json(
    await listAlertEvents({
      ...(projectId ? { projectId } : {}),
      ...(severity ? { severity } : {}),
      ...(status ? { status } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      limit,
      offset,
    }),
  );
});
