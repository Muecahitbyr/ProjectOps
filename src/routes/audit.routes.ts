import { Router } from "express";
import { z } from "zod";
import { listAuditLog } from "../db/audit-log.repository";
import { authenticate } from "../middleware/authenticate";
import { authorizeGlobalAdmin } from "../middleware/authorize";

// Phase 13 Teil 7 "Audit Center" - projektuebergreifende, sensible
// Aktivitaetsdaten (welcher Benutzer hat wo was getan) - nur fuer
// OWNER/ADMIN, analog zu users.routes.ts (authorizeGlobalAdmin).
export const auditRouter = Router();

const querySchema = z.object({
  userId: z.string().trim().min(1).optional(),
  projectId: z.string().trim().min(1).optional(),
  // Phase 28 "Enterprise Maintenance Windows, Change Management &
  // Deployment Risk" - echter, live beim Schreiben der E2E-Tests
  // gefundener Bug: dieses Enum blieb seit der urspruenglichen Einfuehrung
  // (Phase 13) bei den ersten 9 Kategorien stehen, obwohl der
  // AuditCategory-Unionstyp (types/audit.types.ts) laengst SLO (Phase 22),
  // SERVICE (Phase 23), ON_CALL (Phase 24) und DEPLOYMENT (Phase 27)
  // kennt - jede Filterung des Audit-Logs nach einer dieser Kategorien
  // schlug bisher mit 400 fehl, obwohl passende Eintraege existierten.
  category: z.enum(["AUTH", "ALERT", "AUTOMATION", "NOTIFICATION", "INCIDENT", "MAINTENANCE", "BACKUP", "USER", "SYSTEM", "SLO", "SERVICE", "ON_CALL", "DEPLOYMENT", "CHANGE", "PROBLEM"]).optional(),
  severity: z.enum(["INFO", "WARNING", "CRITICAL"]).optional(),
  from: z.string().trim().min(1).optional(),
  to: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(500).catch(100),
});

auditRouter.get("/audit-log", authenticate, authorizeGlobalAdmin(), async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Ungueltige Filter", details: parsed.error.flatten() });
    return;
  }
  const { userId, projectId, category, severity, from, to, limit } = parsed.data;
  res.json(
    await listAuditLog({
      ...(userId ? { userId } : {}),
      ...(projectId ? { projectId } : {}),
      ...(category ? { category } : {}),
      ...(severity ? { severity } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      limit,
    }),
  );
});
