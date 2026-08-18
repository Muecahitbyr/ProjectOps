import { Router } from "express";
import { getDisasterRecoveryReport } from "../core/disaster-recovery";
import { authenticate } from "../middleware/authenticate";

// Phase 13 Teil 9 "Disaster Recovery" - fuer das Dashboard-Widget
// "Disaster Recovery Status" (jeder authentifizierte Benutzer, analog zu
// anderen Dashboard-Datenquellen wie /api/analytics/summary).
export const disasterRecoveryRouter = Router();

disasterRecoveryRouter.get("/disaster-recovery", authenticate, async (_req, res) => {
  res.json(await getDisasterRecoveryReport());
});
