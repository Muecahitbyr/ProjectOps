import { Router } from "express";
import { getDiagnosticsSnapshot } from "../core/diagnostics";
import { authenticate } from "../middleware/authenticate";
import { authorizeGlobalAdmin } from "../middleware/authorize";

// Phase 13 Teil 11 "Diagnostics Center" - Umgebungs-/Versions-/Prozessdaten
// sind sensibel (z.B. Environment, Docker-Status) - nur OWNER/ADMIN.
export const diagnosticsRouter = Router();

diagnosticsRouter.get("/diagnostics", authenticate, authorizeGlobalAdmin(), async (_req, res) => {
  res.json(await getDiagnosticsSnapshot());
});
