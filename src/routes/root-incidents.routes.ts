import { Router } from "express";
import { listRootIncidents } from "../db/root-incidents.repository";
import { authenticate } from "../middleware/authenticate";

export const rootIncidentsRouter = Router();

// Auftragspunkt 7 "Incident Correlation" - regelbasiert gruppierte
// Incidents, siehe incidents/incident-correlation.ts.
rootIncidentsRouter.get("/root-incidents", authenticate, async (req, res) => {
  const limit = Number(req.query.limit) || 50;
  res.json(await listRootIncidents(limit));
});
