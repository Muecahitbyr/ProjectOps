import { Router } from "express";
import { z } from "zod";
import { getDiagnosticSnapshotById, listDiagnosticSnapshots } from "../db/diagnostic-snapshots.repository";
import { authenticate } from "../middleware/authenticate";
import { notFoundError } from "../core/app-error";

export const diagnosticSnapshotsRouter = Router();

const querySchema = z.object({
  projectId: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).catch(50),
});

// Auftragspunkt 6 "Diagnostic Snapshots" - Lese-Zugriff fuer das Frontend
// (z.B. Incident-Detailansicht). Keine authorizeProjectAccess, da die Liste
// wie alerts/maintenance projektuebergreifend gefiltert werden kann - siehe
// dieselbe Begruendung bei alert-events.routes.ts.
diagnosticSnapshotsRouter.get("/diagnostic-snapshots", authenticate, async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Filter", details: parsed.error.flatten() });
    return;
  }

  const { projectId, limit } = parsed.data;
  res.json(await listDiagnosticSnapshots({ ...(projectId ? { projectId } : {}), limit }));
});

diagnosticSnapshotsRouter.get("/diagnostic-snapshots/:id", authenticate, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Ungueltige Snapshot-ID" });
    return;
  }

  const snapshot = await getDiagnosticSnapshotById(id);
  if (!snapshot) {
    throw notFoundError("Diagnostic Snapshot nicht gefunden");
  }
  res.json(snapshot);
});
